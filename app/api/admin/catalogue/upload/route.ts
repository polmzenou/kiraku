import { del, put } from "@vercel/blob";
import { CARD_IMAGE_LIMIT, CARD_IMAGE_TYPES, imageSignature } from "@/lib/catalog/media";
import { getStaff } from "@/server/admin";
import { rateLimit } from "@/server/ratelimit";
import { writeAdminLog } from "@/server/admin/log";
import { prisma } from "@/server/db";
import { isSameOrigin } from "@/server/same-origin";

// Une carte ne s'affiche jamais au-delà de ~720 px de large (fiche ouverte, écran dense) : on la stocke
// ainsi, en WebP, orientée et sans métadonnées. Une image d'admin pouvait peser 4 Mo, servie telle quelle
// à chaque vignette. Sans sharp (binaire absent sur la machine), l'original est gardé.
async function optimizeCardImage(bytes: Uint8Array, type: string): Promise<{ data: Buffer; type: string; extension: string }> {
  try {
    const { default: sharp } = await import("sharp");
    const data = await sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 720, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    return { data, type: "image/webp", extension: "webp" };
  } catch (error) {
    console.error("[catalog-upload] optimisation impossible, original gardé", error);
    return { data: Buffer.from(bytes), type, extension: type === "image/jpeg" ? "jpg" : type === "image/png" ? "png" : "webp" };
  }
}

export async function POST(request: Request) {
  const admin = (await getStaff())?.user;
  if (!admin) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!isSameOrigin(request)) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!(await rateLimit(`admin-upload:${admin.id}`, { limit: 15, windowSeconds: 60 })).success) return Response.json({ error: "RATE_LIMITED" }, { status: 429 });
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token || !process.env.BLOB_PUBLIC_HOST) return Response.json({ error: "STORAGE_UNAVAILABLE" }, { status: 503 });
  const length = Number(request.headers.get("content-length"));
  if (length > CARD_IMAGE_LIMIT + 20_000) return Response.json({ error: "IMAGE_TOO_LARGE" }, { status: 413 });
  // Read a bounded stream before multipart parsing, including chunked requests.
  const reader = request.body?.getReader(); if (!reader) return Response.json({ error: "IMAGE_INVALID" }, { status: 400 });
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
    if (size > CARD_IMAGE_LIMIT + 20_000) { await reader.cancel(); return Response.json({ error: "IMAGE_TOO_LARGE" }, { status: 413 }); } chunks.push(value); }
  try {
    const body = Buffer.concat(chunks); const form = await new Response(body, { headers: { "content-type": request.headers.get("content-type") || "" } }).formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > CARD_IMAGE_LIMIT || !CARD_IMAGE_TYPES.includes(file.type)) return Response.json({ error: "IMAGE_INVALID" }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (imageSignature(bytes) !== file.type) return Response.json({ error: "IMAGE_INVALID" }, { status: 400 });
    const image = await optimizeCardImage(bytes, file.type);
    // Jeton passé explicitement : sinon le SDK préfère VERCEL_OIDC_TOKEN, refusé hors de Vercel
    const blob = await put(`cards/${crypto.randomUUID()}.${image.extension}`, image.data, { access: "public", contentType: image.type, addRandomSuffix: true, token });
    if (new URL(blob.url).hostname !== process.env.BLOB_PUBLIC_HOST) return Response.json({ error: "STORAGE_UNAVAILABLE" }, { status: 503 });
    try {
      await writeAdminLog(prisma, { adminId: admin.id, action: "CARD_IMAGE_UPLOAD", targetType: "CardImage", targetId: blob.pathname, after: { url: blob.url, size: image.data.length, originalSize: file.size } });
    } catch (error) {
      // Pas de trace = pas d'image : on retire le fichier pour ne pas laisser d'orphelin dans le stockage
      await del(blob.url, { token }).catch(() => {});
      throw error;
    }
    return Response.json({ url: blob.url });
  } catch (error) { console.error("[catalog-upload] upload failed", error); return Response.json({ error: "UPLOAD_FAILED" }, { status: 500 }); }
}
