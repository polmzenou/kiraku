import { seeded } from "./reveal-scenes";

// Le mot MANGA écrit au pinceau (révélation MR) : chaque trait a un contour à largeur variable, révélé le long
// de sa ligne centrale. Calculé une fois, sans hasard au rendu.

type Point = readonly [x: number, y: number, halfWidth: number];

/** Traits dans l'ordre d'écriture, lettre par lettre, sur un mot de 1010 × 400. */
const LETTERS: readonly (readonly (readonly Point[])[])[] = [
  [[[62, 52, 20], [52, 200, 30], [40, 352, 16]], [[60, 46, 18], [112, 175, 30], [136, 262, 18]], [[136, 262, 16], [176, 150, 30], [214, 42, 18]], [[214, 44, 20], [220, 200, 32], [232, 356, 14]]],
  [[[345, 40, 16], [305, 200, 32], [262, 358, 14]], [[342, 42, 20], [388, 200, 34], [436, 356, 16]], [[286, 262, 12], [346, 246, 24], [412, 240, 12]]],
  [[[484, 50, 20], [478, 200, 32], [468, 358, 16]], [[486, 46, 20], [552, 200, 34], [618, 352, 18]], [[620, 358, 14], [628, 200, 30], [638, 38, 16]]],
  [[[806, 88, 14], [752, 44, 24], [696, 92, 32], [672, 200, 36], [700, 312, 32], [760, 350, 24], [808, 304, 16]], [[742, 216, 12], [782, 208, 24], [816, 214, 18], [812, 300, 14]]],
  [[[908, 40, 16], [874, 200, 30], [836, 358, 14]], [[905, 42, 18], [942, 200, 32], [980, 356, 14]], [[858, 264, 12], [906, 248, 22], [958, 242, 12]]],
];

/** Début du tracé et durée totale (ms depuis le début de la charge). */
const WRITE_START = 320;
const WRITE_DURATION = 1800;
const GAP_STROKE = 26;
const GAP_LETTER = 90;

export type BrushStroke = {
  id: string;
  /** Ligne centrale, le long de laquelle le trait se révèle. */
  center: string;
  revealWidth: number;
  body: string;
  /** Stries de pinceau sec en fin de trait. */
  dry: string[];
  drops: { cx: number; cy: number; r: number; at: number }[];
  at: number;
  duration: number;
};

const round = (n: number) => Math.round(n * 10) / 10;

/** Catmull-Rom sur la position et la demi-largeur. */
function sample(points: readonly Point[], perSegment = 46): number[][] {
  const P = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))];
  const out: number[][] = [];
  for (let s = 0; s < points.length - 1; s++) {
    for (let k = 0; k < perSegment; k++) {
      const t = k / perSegment, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map((c) => 0.5 * (2 * P(s)[c] + (P(s + 1)[c] - P(s - 1)[c]) * t + (2 * P(s - 1)[c] - 5 * P(s)[c] + 4 * P(s + 1)[c] - P(s + 2)[c]) * t2 + (3 * P(s)[c] - P(s - 1)[c] - 3 * P(s + 1)[c] + P(s + 2)[c]) * t3)));
    }
  }
  out.push([...points[points.length - 1]]);
  return out;
}

let cached: BrushStroke[] | null = null;

export function mangaStrokes(): BrushStroke[] {
  if (cached) return cached;
  const random = seeded(4242);
  // Contour d'un morceau de trait : bords à peine irréguliers
  const ribbon = (line: number[][], from: number, to: number, offset: number, scale: number) => {
    const left: string[] = [], right: string[] = [], last = line.length - 1;
    let wobble = 0;
    for (let i = Math.floor(from * last); i <= Math.ceil(to * last); i++) {
      const p = line[i], next = line[Math.min(last, i + 1)], previous = line[Math.max(0, i - 1)];
      const dx = next[0] - previous[0], dy = next[1] - previous[1], length = Math.hypot(dx, dy) || 1, nx = -dy / length, ny = dx / length;
      wobble = wobble * 0.92 + (random() - 0.5) * 0.035;
      const half = Math.max(0.4, p[2] * scale * (1 + wobble)), shift = offset * p[2];
      left.push(`${round(p[0] + nx * (shift + half))} ${round(p[1] + ny * (shift + half))}`);
      right.unshift(`${round(p[0] + nx * (shift - half))} ${round(p[1] + ny * (shift - half))}`);
    }
    return `M${left.join("L")}L${right.join("L")}Z`;
  };
  const strokes = LETTERS.flatMap((letter, l) => letter.map((points) => {
    const line = sample(points);
    const length = line.reduce((sum, p, i) => sum + (i ? Math.hypot(p[0] - line[i - 1][0], p[1] - line[i - 1][1]) : 0), 0);
    return { line, length, letter: l, widest: Math.max(...points.map((p) => p[2])) };
  }));
  // Chaque trait dure selon sa longueur, avec un temps mort entre les lettres
  const gaps = strokes.reduce((sum, stroke, i) => sum + (i ? (stroke.letter !== strokes[i - 1].letter ? GAP_LETTER : GAP_STROKE) : 0), 0);
  const perUnit = (WRITE_DURATION - gaps) / strokes.reduce((sum, stroke) => sum + stroke.length, 0);
  let at = WRITE_START;
  cached = strokes.map((stroke, i) => {
    if (i) at += stroke.letter !== strokes[i - 1].letter ? GAP_LETTER : GAP_STROKE;
    const duration = Math.round(stroke.length * perUnit);
    const end = stroke.line[stroke.line.length - 1], before = stroke.line[stroke.line.length - 6];
    const dirX = end[0] - before[0], dirY = end[1] - before[1], norm = Math.hypot(dirX, dirY) || 1;
    const result: BrushStroke = {
      id: `rv-brush-${i}`,
      center: `M${stroke.line.map((p) => `${round(p[0])} ${round(p[1])}`).join("L")}`,
      revealWidth: Math.round(stroke.widest * 2.6 + 26),
      body: ribbon(stroke.line, 0, 1, 0, 1),
      dry: [0, 1].map(() => ribbon(stroke.line, 0.62 + random() * 0.18, 0.92 + random() * 0.07, (random() - 0.5) * 1.1, 0.025 + random() * 0.03)),
      // Gouttes projetées quand le pinceau quitte le papier
      drops: [0, 1, 2].map(() => {
        const far = 14 + random() * 46, spread = (random() - 0.5) * 26;
        return { cx: round(end[0] + (dirX / norm) * far + spread), cy: round(end[1] + (dirY / norm) * far + spread * 0.6), r: round(1.5 + random() * 4.5), at: at + duration - 30 };
      }),
      at,
      duration,
    };
    at += duration;
    return result;
  });
  return cached;
}
