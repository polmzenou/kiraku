// Cadres d'avatar : des matières de la DA Kiraku (papier, bambou, indigo, laque, feuille d'or,
// nacre, cerisier, kintsugi, puis nuage, vagues, érable, lune et phénix ; jade réservé aux ambassadeurs ; renaissance,
// estampe et flamme pour le prestige ; fil rouge du parrainage, dessiné par l'image PV2-CADRE-FIL dès 40 px), et les
// cadres illustrés des rangs du classé (images de public/frames, anneau conique aux couleurs du rang en repli).
// L'admin associe un style à une condition (Cosmetic.frameStyle).
// Classes écrites en entier pour que Tailwind les détecte ; anneau peint en dégradé conique.
import { FRAME_ART_SCALE, FRAME_ART_VERSION, FRAME_ART_WIDTHS } from "./frame-art";

export const FRAME_STYLES = ["washi", "bambou", "aizome", "urushi", "kinpaku", "raden", "sakura", "kintsugi", "kumo", "seigaiha", "momiji", "tsuki", "hoo", "hisui", "tensei", "hanga", "hono", "rang-bronze", "rang-argent", "rang-or", "rang-emeraude", "rang-elite", "rang-champion", "rang-grand-champion", "fil"] as const;
export type FrameStyle = (typeof FRAME_STYLES)[number];

export const FRAME_KANJI: Record<FrameStyle, string> = {
  washi: "紙",
  bambou: "竹",
  aizome: "藍",
  urushi: "漆",
  kinpaku: "金",
  raden: "螺",
  sakura: "桜",
  kintsugi: "継",
  kumo: "雲",
  seigaiha: "波",
  momiji: "紅",
  tsuki: "月",
  hoo: "鳳",
  hisui: "翠",
  tensei: "転",
  hanga: "版",
  hono: "炎",
  // Emblèmes des rangs du classé (glyphes déjà dans SEAL_GLYPHS)
  "rang-bronze": "銅",
  "rang-argent": "銀",
  "rang-or": "金",
  "rang-emeraude": "翠",
  "rang-elite": "精",
  "rang-champion": "覇",
  "rang-grand-champion": "極",
  fil: "縁",
};

/** Anneau autour de l'avatar (le padding fait l'épaisseur). */
export const FRAME_RING: Record<FrameStyle, string> = {
  washi: "bg-[conic-gradient(from_200deg,#efe6d2,#d9cfbc,#f6efe0,#cfc3a8,#efe6d2)]",
  bambou: "bg-[conic-gradient(from_90deg,#5f7a3a,#9cb36a,#4d6630,#a9bf78,#5f7a3a)]",
  aizome: "bg-[conic-gradient(from_0deg,#1e3557,#7fa3d1,#2a4a78,#a9c2e2,#1e3557)]",
  urushi: "bg-[conic-gradient(from_45deg,#15120f,#c8372d,#2b1410,#e0533f,#15120f)]",
  kinpaku: "bg-[conic-gradient(from_120deg,#8a6a1f,#d9b556,#f3dc8c,#b08a2e,#8a6a1f)]",
  raden: "bg-[conic-gradient(from_30deg,#e9e4ef,#c9dfe0,#efe3e6,#d8e6dc,#e9e4ef)]",
  sakura: "bg-[conic-gradient(from_60deg,#f1c4cf,#fbe6ea,#e59bb0,#f7d5dc,#f1c4cf)]",
  kintsugi: "bg-[conic-gradient(from_10deg,#2b251f,#d9b556_8%,#2b251f_16%,#3a322a_45%,#d9b556_52%,#2b251f_60%,#2b251f)]",
  kumo: "bg-[conic-gradient(from_150deg,#f4f1ec,#c9ccd3,#ffffff,#b7bcc6,#e8e6e1,#f4f1ec)]",
  seigaiha: "bg-[repeating-conic-gradient(from_0deg,#1e3557_0deg,#2f5f93_18deg,#7fa3d1_30deg,#1e3557_45deg)]",
  momiji: "bg-[conic-gradient(from_20deg,#8f1d14,#e0533f,#f29a3a,#c8372d,#6e1a12,#e86a2c,#8f1d14)]",
  tsuki: "bg-[conic-gradient(from_300deg,#3a3f4a,#c9ced8,#f7f8fb,#9aa2b1,#2b2f37,#dfe3ea,#3a3f4a)]",
  hoo: "bg-[conic-gradient(from_0deg,#c8372d,#d9b556,#f3dc8c,#e0533f,#8a6a1f,#f3dc8c,#c8372d)]",
  hisui: "bg-[conic-gradient(from_160deg,#14432c,#5bbf8b,#d4f7e3,#2e8a5c,#0f3322,#8fdcb2,#14432c)]",
  // Renaissance : laque noire veinée d'or et de vermillon
  tensei: "bg-[conic-gradient(from_0deg,#15120f,#d9b556,#fff3c4,#c8372d,#15120f,#b08a2e,#f3dc8c,#15120f)]",
  // Estampe : washi, vermillon des repères et bois de la planche
  hanga: "bg-[conic-gradient(from_90deg,#f3e6cc,#c8372d_12%,#f3e6cc_24%,#7a5634_50%,#f3e6cc_62%,#c8372d_74%,#f3e6cc)]",
  // Flamme du brasero
  hono: "bg-[conic-gradient(from_200deg,#6e1a12,#e0533f,#f29a3a,#fff3c4,#f29a3a,#c8372d,#6e1a12)]",
  // Rangs du classé : anneau des petits avatars et des images de partage, aux couleurs du cadre illustré
  "rang-bronze": "bg-[conic-gradient(from_200deg,#6b3a1f,#c87a45,#f0b07a,#8f4f2a,#d98b52,#6b3a1f)]",
  "rang-argent": "bg-[conic-gradient(from_200deg,#5d6470,#d8dde5,#ffffff,#8a93a2,#7fa8e8,#5d6470)]",
  "rang-or": "bg-[conic-gradient(from_200deg,#8a5f12,#f2c440,#fff0a8,#c08a1c,#f7d360,#8a5f12)]",
  "rang-emeraude": "bg-[conic-gradient(from_200deg,#0e4a2a,#1f9a55,#d9b556,#137a40,#e7c873,#0e4a2a)]",
  "rang-elite": "bg-[conic-gradient(from_200deg,#13307a,#2f6fe0,#e5ecf5,#39c4f0,#1d4aa8,#13307a)]",
  "rang-champion": "bg-[conic-gradient(from_200deg,#3a0d0b,#b3231b,#f29a3a,#d9a441,#8f1d14,#3a0d0b)]",
  "rang-grand-champion": "bg-[conic-gradient(from_200deg,#3c1460,#8e3fd6,#e8c35a,#b46ef0,#c9952e,#3c1460)]",
  // Fil rouge du parrainage : cordon de soie vermillon (repli des petites tailles et des aperçus de liens)
  fil: "bg-[conic-gradient(from_30deg,#8e2018,#e0533f,#c8372d,#f08a74,#b3261e,#e0533f,#8e2018)]",
};

/** Taille d'avatar à partir de laquelle le fil rouge est dessiné par son image (en dessous, son anneau conique). */
export const FRAME_IMAGE_MIN_SIZE = 40;

export function isFrameStyle(value: unknown): value is FrameStyle {
  return typeof value === "string" && (FRAME_STYLES as readonly string[]).includes(value);
}

/** Cadres illustrés : côté de l'image / diamètre de l'avatar (lib/profile/frame-art.ts, généré avec les images). */
export const FRAME_ART: Partial<Record<FrameStyle, number>> = FRAME_ART_SCALE;

export type FrameArtWidth = (typeof FRAME_ART_WIDTHS)[number];

/** Image d'un cadre illustré, versionnée (cache d'une semaine sur /frames). */
export function frameArtSrc(style: FrameStyle, width: FrameArtWidth, format: "avif" | "webp"): string {
  return `/frames/${style}-${width}-v${FRAME_ART_VERSION}.${format}`;
}

/** srcset des tailles produites : le navigateur prend la plus petite qui couvre l'écran. */
export function frameArtSrcSet(style: FrameStyle, format: "avif" | "webp"): string {
  return FRAME_ART_WIDTHS.map((w) => `${frameArtSrc(style, w, format)} ${w}w`).join(", ");
}
