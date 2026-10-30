import "server-only";
import { CARD_IMAGE_LIMIT, CARD_IMAGE_TYPES, imageSignature } from "@/lib/catalog/media";

// Téléversements d'images de l'admin (cartes du catalogue, bannières Nouveautés) : lecture bornée du
// corps, contrôle du type et de la signature, puis WebP redimensionné par sharp.

export type ImageUpload =
  | { ok: true; bytes: Uint8Array; type: string; size: number }
  | { ok: false; status: 400 | 413 | 500; error: "IMAGE_INVALID" | "IMAGE_TOO_LARGE" | "UPLOAD_FAILED" };

/**
 * Image du champ « file » d'un envoi multipart. Le corps est lu par morceaux et borné avant l'analyse,
 * requêtes découpées comprises ; le type annoncé doit correspondre à la signature du fichier.
 */
export async function readImageUpload(request: Request, limit = CARD_IMAGE_LIMIT): Promise<ImageUpload> {
  const length = Number(request.headers.get("content-length"));
  if (length > limit + 20_000) return { ok: false, status: 413, error: "IMAGE_TOO_LARGE" };
  const reader = request.body?.getReader();
  if (!reader) return { ok: false, status: 400, error: "IMAGE_INVALID" };
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit + 20_000) {
      await reader.cancel();
      return { ok: false, status: 413, error: "IMAGE_TOO_LARGE" };
    }
    chunks.push(value);
  }
  try {
    const form = await new Response(Buffer.concat(chunks), { headers: { "content-type": request.headers.get("content-type") || "" } }).formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > limit || !CARD_IMAGE_TYPES.includes(file.type)) return { ok: false, status: 400, error: "IMAGE_INVALID" };
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (imageSignature(bytes) !== file.type) return { ok: false, status: 400, error: "IMAGE_INVALID" };
    return { ok: true, bytes, type: file.type, size: file.size };
  } catch (error) {
    console.error("[image-upload] corps illisible", error);
    return { ok: false, status: 500, error: "UPLOAD_FAILED" };
  }
}

/** WebP orienté, sans métadonnées, au plus `width` px de large. Sans sharp (binaire absent), l'original est gardé. */
export async function optimizeImage(bytes: Uint8Array, type: string, width: number): Promise<{ data: Buffer; type: string; extension: string }> {
  try {
    const { default: sharp } = await import("sharp");
    const data = await sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    return { data, type: "image/webp", extension: "webp" };
  } catch (error) {
    console.error("[image-upload] optimisation impossible, original gardé", error);
    return { data: Buffer.from(bytes), type, extension: type === "image/jpeg" ? "jpg" : type === "image/png" ? "png" : "webp" };
  }
}
