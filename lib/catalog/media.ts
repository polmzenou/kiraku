export const CARD_IMAGE_LIMIT = 4 * 1024 * 1024;
export const CARD_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export function imageSignature(bytes: Uint8Array): string | null {
  if (bytes.length >= 12 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && [137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n)) return "image/png";
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length >= 16 && ascii(0,4) === "RIFF" && ascii(8,12) === "WEBP") return "image/webp";
  return null;
}
export function validCardImageUrl(raw: string, blobHost?: string): boolean {
  try { const u = new URL(raw); return u.protocol === "https:" && !u.username && !u.password && !u.port &&
    (u.hostname === "s4.anilist.co" || Boolean(blobHost && u.hostname === blobHost && u.pathname.startsWith("/cards/"))); }
  catch { return false; }
}
