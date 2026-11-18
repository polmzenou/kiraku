// Filtre Gold des fuda (components/fuda/FudaEffects.css, .fuda-art-gold) :
//   sepia(1) saturate(2.4) hue-rotate(-14deg) brightness(1.04) contrast(1.08)
// Satori (images de partage) n'applique pas les filtres CSS : on les compose en une matrice de couleurs
// 3 × 3 suivie d'une fonction affine, appliquées à l'illustration par sharp (server/og/assets.ts).
// Mêmes formules que la spécification Filter Effects (matrices de sepia, saturate, hue-rotate).

type Matrix = [[number, number, number], [number, number, number], [number, number, number]];

const SEPIA: Matrix = [
  [0.393, 0.769, 0.189],
  [0.349, 0.686, 0.168],
  [0.272, 0.534, 0.131],
];

function saturate(s: number): Matrix {
  return [
    [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s],
  ];
}

function hueRotate(deg: number): Matrix {
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [
    [0.213 + 0.787 * c - 0.213 * s, 0.715 - 0.715 * c - 0.715 * s, 0.072 - 0.072 * c + 0.928 * s],
    [0.213 - 0.213 * c + 0.143 * s, 0.715 + 0.285 * c + 0.14 * s, 0.072 - 0.072 * c - 0.283 * s],
    [0.213 - 0.213 * c - 0.787 * s, 0.715 - 0.715 * c + 0.715 * s, 0.072 + 0.928 * c + 0.072 * s],
  ];
}

function multiply(a: Matrix, b: Matrix): Matrix {
  return a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j])) as Matrix;
}

const BRIGHTNESS = 1.04;
const CONTRAST = 1.08;

/**
 * Filtre Gold en une étape : `matrix` (sepia, puis saturate, puis hue-rotate) et la fonction affine
 * `v ↦ slope × v + intercept` sur 0–255 (brightness puis contrast).
 */
export const GOLD_TONE = {
  matrix: multiply(hueRotate(-14), multiply(saturate(2.4), SEPIA)),
  slope: BRIGHTNESS * CONTRAST,
  intercept: 255 * 0.5 * (1 - CONTRAST),
} as const;

/** Couleur RVB (0–255) après le filtre Gold, bornée comme dans le navigateur. */
export function goldPixel([r, g, b]: readonly [number, number, number]): [number, number, number] {
  const clamp = (v: number) => Math.min(255, Math.max(0, v));
  return GOLD_TONE.matrix.map((row) => clamp(GOLD_TONE.slope * clamp(row[0] * r + row[1] * g + row[2] * b) + GOLD_TONE.intercept)) as [number, number, number];
}
