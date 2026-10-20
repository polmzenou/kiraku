/** Point de la ligne de déchirure, en % de la bande du sachet (x de gauche à droite, y de haut en bas). */
export type TearPoint = readonly [x: number, y: number];

/** Hauteur moyenne de la déchirure dans la bande (sur la ligne pointillée). */
const TEAR_Y = 88;

/** Ligne de déchirure irrégulière, toujours la même pour une graine donnée (pas de saut entre deux rendus). */
export function tearLine(steps = 26, seed = 7, amplitude = 14): TearPoint[] {
  let s = seed;
  const next = () => (s = (s * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: steps + 1 }, (_, i) => [(i / steps) * 100, TEAR_Y + (next() - 0.5) * amplitude] as const);
}

/** Clip-path du reste de bande qui reste serti sur le sachet, sous la déchirure. */
export function belowClip(line: readonly TearPoint[]): string {
  const pt = ([x, y]: TearPoint) => `${Math.round(x * 100) / 100}% ${Math.round(y * 100) / 100}%`;
  return `polygon(${[...line, [100, 100] as const, [0, 100] as const].map(pt).join(",")})`;
}

/** Front de déchirure (en %) pour une progression du geste, depuis le bord où le doigt a commencé. */
export function tornRange(progress: number, direction: 1 | -1) {
  const p = Math.min(1, Math.max(0, progress));
  const front = direction === 1 ? p * 100 : 100 - p * 100;
  return { front, torn: direction === 1 ? ([0, front] as const) : ([front, 100] as const) };
}

/** Un morceau de bande [from, to] (en %) est arraché quand le front l'a entièrement dépassé. */
export function pieceTorn(progress: number, direction: 1 | -1, from: number, to: number): boolean {
  if (progress >= 1) return true;
  const [start, end] = tornRange(progress, direction).torn;
  return end - start > 0 && from >= start && to <= end;
}
