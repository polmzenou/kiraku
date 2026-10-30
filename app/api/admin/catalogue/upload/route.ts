import { del, put } from "@vercel/blob";
import { getStaff } from "@/server/admin";
import { rateLimit } from "@/server/ratelimit";
import { writeAdminLog } from "@/server/admin/log";
import { prisma } from "@/server/db";
import { optimizeImage, readImageUpload } from "@/server/media/image-upload";
import { isSameOrigin } from "@/server/same-origin";

// Une carte ne s'affiche jamais au-delà de ~720 px de large (fiche ouverte, écran dense) : on la stocke
// ainsi, en WebP, orientée et sans métadonnées. Une image d'admin pouvait peser 4 Mo, servie telle quelle
// à chaque vignette.
const CARD_WIDTH = 720;

export async function POST(request: Request) {
  const admin = (await getStaff())?.user;
  if (!admin) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!isSameOrigin(request)) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!(await rateLimit(`admin-upload:${admin.id}`, { limit: 15, windowSeconds: 60 })).success) return Response.json({ error: "RATE_LIMITED" }, { status: 429 });
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token || !process.env.BLOB_PUBLIC_HOST) return Response.json({ error: "STORAGE_UNAVAILABLE" }, { status: 503 });
  const upload = await readImageUpload(request);
  if (!upload.ok) return Response.json({ error: upload.error }, { status: upload.status });
  try {
    const image = await optimizeImage(upload.bytes, upload.type, CARD_WIDTH);
    // Jeton passé explicitement : sinon le SDK préfère VERCEL_OIDC_TOKEN, refusé hors de Vercel
    const blob = await put(`cards/${crypto.randomUUID()}.${image.extension}`, image.data, { access: "public", contentType: image.type, addRandomSuffix: true, token });
    if (new URL(blob.url).hostname !== process.env.BLOB_PUBLIC_HOST) return Response.json({ error: "STORAGE_UNAVAILABLE" }, { status: 503 });
    try {
      await writeAdminLog(prisma, { adminId: admin.id, action: "CARD_IMAGE_UPLOAD", targetType: "CardImage", targetId: blob.pathname, after: { url: blob.url, size: image.data.length, originalSize: upload.size } });
    } catch (error) {
      // Pas de trace = pas d'image : on retire le fichier pour ne pas laisser d'orphelin dans le stockage
      await del(blob.url, { token }).catch(() => {});
      throw error;
    }
    return Response.json({ url: blob.url });
  } catch (error) { console.error("[catalog-upload] upload failed", error); return Response.json({ error: "UPLOAD_FAILED" }, { status: 500 }); }
}
