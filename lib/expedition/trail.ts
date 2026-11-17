// Tracé du rouleau d'expédition : le chemin que la lanterne du groupe parcourt sur le paysage
// (public/expedition/emaki-dawn-v1.webp et emaki-dusk-v1.webp, 2048 × 768, même cadrage), de la
// forêt du premier plan jusqu'à la crête lointaine, en passant par le sommet. Positions en pixels
// de l'image, rendues en % par le composant : le chemin reste collé au paysage quel que soit le
// recadrage. Changer d'image impose de relever de nouveau les points.

export const EMAKI_IMAGE = { width: 2048, height: 768 } as const;

/** Rouleau : hauteur fixe (h-56) et largeur maximale (conteneur de 1 200 px moins ses marges). */
export const EMAKI_FRAME = { height: 224, maxWidth: 1168 } as const;

/**
 * Points relevés sur l'image : [x, y, profondeur]. Profondeur 1 = premier plan ; plus elle est
 * petite, plus le point est loin (la lanterne et les relais y rapetissent, et y avancent moins vite).
 */
export const TRAIL_POINTS: readonly (readonly [number, number, number])[] = [
  [170, 548, 1], // départ, dans la forêt du premier plan
  [330, 480, 0.95],
  [470, 420, 0.89],
  [600, 380, 0.84], // crête verte
  [720, 377, 0.81],
  [850, 392, 0.78],
  [895, 355, 0.75], // traversée de la brume
  [955, 292, 0.73], // flanc du sommet
  [1006, 252, 0.72], // sommet
  [1110, 282, 0.71],
  [1200, 304, 0.7], // col
  [1300, 298, 0.7],
  [1400, 293, 0.7],
  [1560, 312, 0.7],
  [1700, 307, 0.7],
  [1870, 300, 0.7], // arrivée, sur la crête lointaine
];

/** Relais 宿 : indices dans TRAIL_POINTS (départ, crête, sommet, arrivée). */
export const TRAIL_STATION_POINTS = [0, 4, 8, 15] as const;

/** Échantillons par segment de la courbe. */
const STEPS = 24;

/** Point de la courbe ; `at` = progression du voyage (0 → 1) à laquelle la lanterne y passe. */
export type TrailSample = { x: number; y: number; depth: number; at: number };

/**
 * Courbe de Catmull-Rom passant par tous les points, échantillonnée. La progression suit la
 * distance « réelle » : un pas au loin (petite profondeur) compte plus qu'un pas au premier plan.
 */
export function sampleTrail(points: readonly (readonly [number, number, number])[] = TRAIL_POINTS, steps = STEPS): TrailSample[] {
  if (points.length < 2) throw new Error("Un tracé demande au moins deux points");
  const at = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))];
  const samples: TrailSample[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = (k: 0 | 1) =>
        0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      samples.push({ x: c(0), y: c(1), depth: p1[2] + (p2[2] - p1[2]) * t, at: 0 });
    }
  }
  const last = points[points.length - 1];
  samples.push({ x: last[0], y: last[1], depth: last[2], at: 0 });

  let total = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    total += Math.hypot(b.x - a.x, b.y - a.y) / ((a.depth + b.depth) / 2);
    b.at = total;
  }
  for (const sample of samples) sample.at = total > 0 ? sample.at / total : 0;
  return samples;
}

export const TRAIL: readonly TrailSample[] = sampleTrail();

/** Relais : position sur le chemin et progression à laquelle ils s'allument. */
export const TRAIL_STATIONS: readonly TrailSample[] = TRAIL_STATION_POINTS.map((i) => TRAIL[i * STEPS]);

/** Position de la lanterne pour une progression 0 → 1 (bornée), et l'échantillon qui la précède. */
export function trailPointAt(progress: number, samples: readonly TrailSample[] = TRAIL): TrailSample & { index: number } {
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].at <= p) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const k = b.at === a.at ? 0 : Math.min(1, Math.max(0, (p - a.at) / (b.at - a.at)));
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, depth: a.depth + (b.depth - a.depth) * k, at: p, index: lo };
}

const round = (n: number) => Math.round(n * 10) / 10;
const toPath = (points: readonly { x: number; y: number }[]) => points.map((p, i) => `${i ? "L" : "M"}${round(p.x)} ${round(p.y)}`).join(" ");

/** Chemin SVG complet (coordonnées de l'image). */
export const TRAIL_PATH = toPath(TRAIL);

/** Portion déjà parcourue, jusqu'à la lanterne. */
export function walkedPath(progress: number, samples: readonly TrailSample[] = TRAIL): string {
  const here = trailPointAt(progress, samples);
  return toPath([...samples.slice(0, here.index + 1), here]);
}
