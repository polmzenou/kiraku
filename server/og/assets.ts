import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Ressources des images de partage : polices TrueType (scripts/og-fonts.mts), sceau 気楽, et images
// distantes (avatar Discord, illustrations) téléchargées ici puis passées à Satori en data URI.

type OgFont = { name: string; data: Buffer; weight: 400 | 500 | 700 | 800; style: "normal" };

const FONT_FILES = [
  { name: "Dela Gothic One", file: "dela-gothic-one-400-latin.ttf", weight: 400 },
  { name: "Shippori Mincho B1", file: "shippori-mincho-b1-800-latin.ttf", weight: 800 },
  { name: "Zen Kaku Gothic New", file: "zen-kaku-gothic-new-500-latin.ttf", weight: 500 },
  { name: "Zen Kaku Gothic New", file: "zen-kaku-gothic-new-700-latin.ttf", weight: 700 },
  { name: "Yuji Syuku", file: "yuji-syuku-og.ttf", weight: 400 },
] as const;

let fonts: Promise<OgFont[]> | null = null;

/** Polices lues une fois par instance. */
export function ogFonts(): Promise<OgFont[]> {
  fonts ??= Promise.all(
    FONT_FILES.map(async (f) => ({
      name: f.name,
      weight: f.weight,
      style: "normal" as const,
      data: await readFile(join(process.cwd(), "server/og/fonts", f.file)),
    })),
  ).catch((e) => {
    fonts = null;
    throw e;
  });
  return fonts;
}

let seal: Promise<string> | null = null;

/** Sceau 気楽 de l'application (icône 512). */
export function ogSeal(): Promise<string> {
  seal ??= readFile(join(process.cwd(), "public/icons/icon-512.png")).then((b) => `data:image/png;base64,${b.toString("base64")}`);
  return seal;
}

/** Hôtes d'images connus (ceux de next.config.ts) : jamais d'URL arbitraire téléchargée par le serveur. */
function allowedHost(hostname: string): boolean {
  return hostname === "s4.anilist.co" || hostname === "cdn.discordapp.com" || hostname === process.env.BLOB_PUBLIC_HOST;
}

const MAX_BYTES = 3 * 1024 * 1024;
const TYPES = new Set(["image/png", "image/jpeg", "image/gif"]);

/**
 * Image distante en data URI, ou null (hôte inconnu, format que Satori ne lit pas, délai dépassé).
 * Les avatars Discord sont demandés en PNG : Satori ne décode pas le WebP.
 */
export async function remoteImage(raw: string | null | undefined, timeoutMs = 3_000): Promise<string | null> {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !allowedHost(url.hostname)) return null;
  if (url.hostname === "cdn.discordapp.com") {
    url.pathname = url.pathname.replace(/\.(webp|gif)$/, ".png");
    url.searchParams.set("size", "256");
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "error" });
    const type = res.headers.get("content-type")?.split(";")[0].trim() ?? "";
    if (!res.ok || !TYPES.has(type)) return null;
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length > MAX_BYTES) return null;
    return `data:${type};base64,${body.toString("base64")}`;
  } catch {
    return null;
  }
}
