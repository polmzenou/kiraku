import { del, put } from "@vercel/blob";
import { validNewsImageUrl } from "@/lib/home/news";
import { getAdmin } from "@/server/admin";
import { writeAdminLog } from "@/server/admin/log";
import { prisma } from "@/server/db";
import { optimizeImage, readImageUpload } from "@/server/media/image-upload";
import { rateLimit } from "@/server/ratelimit";
import { isSameOrigin } from "@/server/same-origin";

// Image d'une bannière Nouveautés (fond de l'encart de l'accueil). Une bannière s'affiche au plus sur
// ~1 200 px de large : on la stocke en WebP sur 1 600 px au plus (écrans denses), sous news/. Réservé
// aux admins complets : le rôle DEV ne prépare que des brouillons du catalogue.
const BANNER_WIDTH = 1_600;

export async function POST(request: Request) {
  const admin = await getAdmin();
  if (!admin) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!isSameOrigin(request)) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!(await rateLimit(`admin-upload:${admin.id}`, { limit: 15, windowSeconds: 60 })).success) return Response.json({ error: "RATE_LIMITED" }, { status: 429 });
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token || !process.env.BLOB_PUBLIC_HOST) return Response.json({ error: "STORAGE_UNAVAILABLE" }, { status: 503 });
  const upload = await readImageUpload(request);
  if (!upload.ok) return Response.json({ error: upload.error }, { status: upload.status });
  try {
    const image = await optimizeImage(upload.bytes, upload.type, BANNER_WIDTH);
    // Jeton passé explicitement : sinon le SDK préfère VERCEL_OIDC_TOKEN, refusé hors de Vercel
    const blob = await put(`news/${crypto.randomUUID()}.${image.extension}`, image.data, { access: "public", contentType: image.type, addRandomSuffix: true, token });
    if (!validNewsImageUrl(blob.url, process.env.BLOB_PUBLIC_HOST)) return Response.json({ error: "STORAGE_UNAVAILABLE" }, { status: 503 });
    try {
      await writeAdminLog(prisma, { adminId: admin.id, action: "NEWS_IMAGE_UPLOAD", targetType: "NewsImage", targetId: blob.pathname, after: { url: blob.url, size: image.data.length, originalSize: upload.size } });
    } catch (error) {
      // Pas de trace = pas d'image : on retire le fichier pour ne pas laisser d'orphelin dans le stockage
      await del(blob.url, { token }).catch(() => {});
      throw error;
    }
    return Response.json({ url: blob.url });
  } catch (error) {
    console.error("[news-upload] upload failed", error);
    return Response.json({ error: "UPLOAD_FAILED" }, { status: 500 });
  }
}
