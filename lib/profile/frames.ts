// Cadres d'avatar : des matières de la DA Kiraku (papier, bambou, indigo, laque, feuille d'or,
// nacre, cerisier, kintsugi, puis nuage, vagues, érable, lune et phénix). L'admin associe un style à une condition (Cosmetic.frameStyle).
// Classes écrites en entier pour que Tailwind les détecte ; anneau peint en dégradé conique.

export const FRAME_STYLES = ["washi", "bambou", "aizome", "urushi", "kinpaku", "raden", "sakura", "kintsugi", "kumo", "seigaiha", "momiji", "tsuki", "hoo"] as const;
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
};

export function isFrameStyle(value: unknown): value is FrameStyle {
  return typeof value === "string" && (FRAME_STYLES as readonly string[]).includes(value);
}
