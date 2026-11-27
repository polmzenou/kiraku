import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { GOLD_TONE } from "@/lib/og/gold";
import { loadSharp } from "@/server/media/sharp";

// Ressources des images de partage : polices TrueType (scripts/og-fonts.mts), sceau 気楽, et images
// distantes (avatar Discord, illustrations) téléchargées ici puis passées à Satori en data URI.

export type OgFont = { name: string; data: Buffer; weight: 400 | 500 | 700 | 800; style: "normal" };

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
/** Formats convertis en PNG par sharp : les créations originales sont enregistrées en WebP (éditeur du catalogue). */
const CONVERTED = new Set(["image/webp"]);
/** Largeur maximale d'une illustration passée à Satori (les fuda des images font au plus ~400 px). */
const MAX_WIDTH = 640;

/**
 * Illustration retravaillée pour Satori : WebP converti en PNG, réduite, et teinte Gold du site appliquée
 * si demandé (Satori ignore les filtres CSS). Null si sharp manque et que le format l'exige.
 */
export async function processImage(body: Buffer, type: string, gold: boolean): Promise<{ body: Buffer; type: string } | null> {
  if (!gold && !CONVERTED.has(type)) return { body, type };
  const sharp = await loadSharp();
  if (!sharp) return CONVERTED.has(type) ? null : { body, type };
  let image = sharp(body).rotate().resize({ width: MAX_WIDTH, withoutEnlargement: true });
  if (gold) image = image.recomb(GOLD_TONE.matrix.map((row) => [...row]) as [[number, number, number], [number, number, number], [number, number, number]]).linear(GOLD_TONE.slope, GOLD_TONE.intercept);
  return { body: await image.png().toBuffer(), type: "image/png" };
}

const locals = new Map<string, Promise<string | null>>();

/**
 * Image du dossier public en data URI pour Satori (décors du parrainage…), gardée en mémoire : un WebP est converti
 * en PNG par sharp (Satori ne le lit pas) et réduit à `maxWidth`. null si le fichier ou sharp manque.
 */
export function localImage(publicPath: string, maxWidth = 1200): Promise<string | null> {
  let image = locals.get(publicPath);
  if (!image) {
    image = (async () => {
      const body = await readFile(join(process.cwd(), "public", publicPath.replace(/^\/+/, "")));
      if (/\.webp$/i.test(publicPath)) {
        const sharp = await loadSharp();
        if (!sharp) return null;
        const png = await sharp(body).resize({ width: maxWidth, withoutEnlargement: true }).png().toBuffer();
        return `data:image/png;base64,${png.toString("base64")}`;
      }
      return `data:${/\.jpe?g$/i.test(publicPath) ? "image/jpeg" : "image/png"};base64,${body.toString("base64")}`;
    })().catch(() => null);
    locals.set(publicPath, image);
  }
  return image;
}

/**
 * Image distante en data URI, ou null (hôte inconnu, format que Satori ne lit pas, délai dépassé).
 * Les avatars Discord sont demandés en PNG : Satori ne décode pas le WebP.
 */
export async function remoteImage(raw: string | null | undefined, timeoutMs = 3_000, opts: { gold?: boolean } = {}): Promise<string | null> {
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
    if (!res.ok || !(TYPES.has(type) || CONVERTED.has(type))) return null;
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length > MAX_BYTES) return null;
    const image = await processImage(body, type, opts.gold === true);
    return image ? `data:${image.type};base64,${image.body.toString("base64")}` : null;
  } catch {
    return null;
  }
}
