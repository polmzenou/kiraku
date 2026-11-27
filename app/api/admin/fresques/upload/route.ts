import { del, put } from "@vercel/blob";
import { getAdmin } from "@/server/admin";
import { prisma } from "@/server/db";
import { FrescoAdminError, replaceFrescoImagesWith } from "@/server/fresco/admin-core";
import { cutFresco, FrescoCutError } from "@/server/fresco/cut";
import { readImageUpload } from "@/server/media/image-upload";
import { rateLimit } from "@/server/ratelimit";
import { isSameOrigin } from "@/server/same-origin";

// Image d'une fresque en brouillon (admin seulement) : découpée ici en fragments, chacun envoyé au stockage
// sous un nom aléatoire (frescoes/<uuid>, suffixe aléatoire) : rien ne relie deux fragments, et aucun ne se
// devine. Une fresque publiée ne change plus d'image.

const ID = /^[A-Za-z0-9_-]{1,40}$/;

export async function POST(request: Request) {
  const admin = await getAdmin();
  if (!admin) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!isSameOrigin(request)) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!(await rateLimit(`admin-fresco-upload:${admin.id}`, { limit: 6, windowSeconds: 60 })).success) return Response.json({ error: "RATE_LIMITED" }, { status: 429 });
  const frescoId = new URL(request.url).searchParams.get("fresque") ?? "";
  if (!ID.test(frescoId)) return Response.json({ error: "IMAGE_INVALID" }, { status: 400 });
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const host = process.env.BLOB_PUBLIC_HOST;
  if (!token || !host) return Response.json({ error: "STORAGE_UNAVAILABLE" }, { status: 503 });
  const fresco = await prisma.fresco.findUnique({ where: { id: frescoId }, select: { status: true } });
  if (!fresco) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  if (fresco.status !== "DRAFT") return Response.json({ error: "NOT_DRAFT" }, { status: 409 });

  const upload = await readImageUpload(request);
  if (!upload.ok) return Response.json({ error: upload.error }, { status: upload.status });

  let cut: Awaited<ReturnType<typeof cutFresco>>;
  try {
    cut = await cutFresco(upload.bytes);
  } catch (error) {
    if (error instanceof FrescoCutError) return Response.json({ error: error.code }, { status: 400 });
    console.error("[fresco-upload] découpe impossible", error);
    return Response.json({ error: "UPLOAD_FAILED" }, { status: 500 });
  }

  const sent: string[] = [];
  // Jeton passé explicitement : sinon le SDK préfère VERCEL_OIDC_TOKEN, refusé hors de Vercel
  const send = async (data: Buffer) => {
    const blob = await put(`frescoes/${crypto.randomUUID()}.webp`, data, { access: "public", contentType: "image/webp", addRandomSuffix: true, token });
    sent.push(blob.url);
    if (new URL(blob.url).hostname !== host) throw new Error("STORAGE_HOST");
    return blob.url;
  };
  try {
    const [imageUrl, teaserUrl, ...pieceUrls] = await Promise.all([send(cut.full), send(cut.teaser), ...cut.pieces.map((p) => send(p.data))]);
    const replaced = await replaceFrescoImagesWith(prisma, admin.id, frescoId, {
      imageUrl,
      teaserUrl,
      width: cut.width,
      height: cut.height,
      pieces: cut.pieces.map((p, i) => ({ position: p.position, imageUrl: pieceUrls[i] })),
    });
    // Anciennes images : retirées après coup, un échec ne laisse qu'un fichier orphelin
    if (replaced.length > 0) await del(replaced, { token }).catch((e) => console.error("[fresco-upload] anciennes images non supprimées", e));
    return Response.json({ ok: true });
  } catch (error) {
    // Rien d'enregistré : on retire tout ce qui est parti, pour ne pas laisser d'orphelin
    if (sent.length > 0) await del(sent, { token }).catch(() => {});
    if (error instanceof FrescoAdminError) return Response.json({ error: error.code }, { status: error.code === "NOT_FOUND" ? 404 : 409 });
    console.error("[fresco-upload] envoi impossible", error);
    return Response.json({ error: "UPLOAD_FAILED" }, { status: 500 });
  }
}
