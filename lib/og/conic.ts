// Anneaux des cadres d'avatar pour les images de partage. Satori (next/og) ne connaît pas
// conic-gradient : on relit le dégradé de FRAME_RING et on le peint en fins secteurs SVG.

export type ConicStop = { color: string; at: number };
export type Conic = { from: number; repeating: boolean; stops: ConicStop[] };

const CLASS = /^bg-\[(repeating-)?conic-gradient\(from_(-?\d+(?:\.\d+)?)deg,(.+)\)\]$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

/** `bg-[conic-gradient(from_200deg,#efe6d2,#d9cfbc_30%,…)]` → angle de départ et arrêts en degrés. */
export function parseConic(className: string): Conic | null {
  const match = CLASS.exec(className.trim());
  if (!match) return null;
  const raw = match[3].split(",").map((part) => {
    const [color, pos] = part.split("_");
    const at = !pos ? null : pos.endsWith("%") ? Number(pos.slice(0, -1)) * 3.6 : pos.endsWith("deg") ? Number(pos.slice(0, -3)) : NaN;
    return { color, at };
  });
  if (raw.length < 2 || raw.some((s) => !HEX.test(s.color) || Number.isNaN(s.at))) return null;

  // Règles CSS : premier arrêt à 0, dernier à 360, positions croissantes, trous répartis à égalité
  const at = raw.map((s) => s.at);
  if (at[0] === null) at[0] = 0;
  if (at[at.length - 1] === null) at[at.length - 1] = 360;
  for (let i = 1; i < at.length; i++) if (at[i] !== null) at[i] = Math.max(at[i]!, at[i - 1] ?? 0);
  for (let i = 1; i < at.length; i++) {
    if (at[i] !== null) continue;
    let j = i;
    while (at[j] === null) j++;
    const start = at[i - 1]!;
    const step = (at[j]! - start) / (j - i + 1);
    for (let k = i; k < j; k++) at[k] = start + step * (k - i + 1);
  }
  return { from: Number(match[2]), repeating: Boolean(match[1]), stops: raw.map((s, i) => ({ color: s.color.toLowerCase(), at: at[i]! })) };
}

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb: number[]) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;

/** Couleur au degré `angle` (0 = départ du dégradé, sens horaire). */
export function colorAt(conic: Conic, angle: number): string {
  const { stops } = conic;
  const first = stops[0].at;
  const last = stops[stops.length - 1].at;
  let a = ((angle % 360) + 360) % 360;
  if (conic.repeating && last > first) a = first + ((((a - first) % (last - first)) + (last - first)) % (last - first));
  if (a <= first) return stops[0].color;
  if (a >= last) return stops[stops.length - 1].color;
  const i = stops.findIndex((s) => s.at >= a);
  const prev = stops[i - 1];
  const next = stops[i];
  const t = next.at === prev.at ? 1 : (a - prev.at) / (next.at - prev.at);
  const [p, n] = [channels(prev.color), channels(next.color)];
  return toHex(p.map((c, k) => c + (n[k] - c) * t));
}

const SEGMENTS = 180;
const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Anneau SVG (`size` × `size`, épaisseur `thickness`) peint en SEGMENTS secteurs. Comme en CSS,
 * 0° est en haut et le dégradé tourne dans le sens horaire à partir de `from`.
 */
export function conicRingSvg(conic: Conic, size: number, thickness: number): string {
  const c = size / 2;
  const outer = c;
  const inner = c - thickness;
  const point = (r: number, deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return `${round(c + r * Math.sin(rad))} ${round(c - r * Math.cos(rad))}`;
  };
  const step = 360 / SEGMENTS;
  const paths: string[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const a = conic.from + i * step;
    // Léger recouvrement : pas de fil clair entre deux secteurs voisins
    const b = a + step + 0.6;
    const d = `M${point(outer, a)}A${outer} ${outer} 0 0 1 ${point(outer, b)}L${point(inner, b)}A${inner} ${inner} 0 0 0 ${point(inner, a)}Z`;
    paths.push(`<path d="${d}" fill="${colorAt(conic, i * step + step / 2)}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${paths.join("")}</svg>`;
}
