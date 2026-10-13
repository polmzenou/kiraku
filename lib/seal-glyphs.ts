// Kanji tracés en Yuji Syuku (sceaux, emblèmes, logo). La police est réduite
// à ces seuls caractères par scripts/subset-seal-font.mts : ajoute ici tout
// nouveau kanji de sceau, puis relance `npm run fonts:subset`.
export const SEAL_GLYPHS = [
  "並良稀秀金神", // raretés
  "気楽", // logo
  "新", // nouvelle carte
  "銭", // Zeni
  "力気", // stats
  "夜和紙墨朱藍", // thèmes et couleurs
  "一二三四五六七八九十百入枚", // contenance des sachets
].join("");
