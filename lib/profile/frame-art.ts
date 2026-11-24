// Généré par scripts/rank-frames.mjs (npm run frames:assets) : ne pas modifier à la main.
// Cadres illustrés : public/frames/<style>-<largeur>-v<version>.{avif,webp}, recadrés en carré centré sur l'ouverture.
// Échelle : côté de l'image / diamètre de l'avatar (l'avatar passe un peu sous le bord intérieur de l'anneau).

export const FRAME_ART_VERSION = 1;

export const FRAME_ART_WIDTHS = [192, 384] as const;

export const FRAME_ART_SCALE = {
  "rang-bronze": 1.4258,
  "rang-argent": 1.4113,
  "rang-or": 1.5018,
  "rang-emeraude": 1.5229,
  "rang-elite": 1.547,
  "rang-champion": 1.5236,
  "rang-grand-champion": 1.7882,
} as const;
