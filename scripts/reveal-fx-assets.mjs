// Génère public/fx/ : la fumée du brouillard noir (BR). Déplacer une image fixe en transform coûte bien
// moins cher sur téléphone qu'un filtre ou un masque CSS animé. Relancer `npm run fx:assets` après toute retouche.
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const out = fileURLToPath(new URL("../public/fx/", import.meta.url));
mkdirSync(out, { recursive: true });

let seed = 1337;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
// Bruit raccordable : la texture peut se répéter sans couture
const octave = (n) => {
  const grid = Float32Array.from({ length: n * n }, rand);
  const ease = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const X = (((x % 1) + 1) % 1) * n, Y = (((y % 1) + 1) % 1) * n;
    const x0 = Math.floor(X), y0 = Math.floor(Y), x1 = (x0 + 1) % n, y1 = (y0 + 1) % n, u = ease(X - x0), v = ease(Y - y0);
    return (grid[y0 * n + x0] * (1 - u) + grid[y0 * n + x1] * u) * (1 - v) + (grid[y1 * n + x0] * (1 - u) + grid[y1 * n + x1] * u) * v;
  };
};
const fbm = (base, count = 3) => {
  const layers = Array.from({ length: count }, (_, i) => octave(base * 2 ** i));
  return (x, y) => layers.reduce((sum, f, i) => sum + f(x, y) / 2 ** (i + 1), 0) / (1 - 1 / 2 ** count);
};
const body = fbm(2, 3), warpX = fbm(2, 2), warpY = fbm(2, 2);
const field = (x, y) => body(x + 0.42 * (warpX(x, y) - 0.5), y + 0.42 * (warpY(x + 0.37, y + 0.11) - 0.5));
const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const S = 512;
const raw = Buffer.alloc(S * S * 4);
for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
  const x = i / S, y = j / S, f = field(x, y);
  // Lumière rasante très douce : la fumée reste noire, ses volumes se devinent
  const lit = Math.min(1, Math.max(0, 0.5 + (field(x + 0.03, y + 0.045) - f) * -5));
  const grey = 3 + lit * lit * 50, k = (j * S + i) * 4;
  raw[k] = grey; raw[k + 1] = grey; raw[k + 2] = grey + 3; raw[k + 3] = 255 * smooth(0.3, 0.68, f);
}
const smoke = await sharp(raw, { raw: { width: S, height: S, channels: 4 } }).blur(3).raw().toBuffer();
await sharp(smoke, { raw: { width: S, height: S, channels: 4 } }).webp({ quality: 60, alphaQuality: 62 }).toFile(`${out}smoke.webp`);

// Formes cuites dans l'image : pas de masque à recalculer pendant l'animation
const shaped = async (size, repeat, alpha, file) => {
  const buffer = Buffer.alloc(size * size * 4);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const from = (Math.floor((j / size) * repeat * S) % S) * S * 4 + (Math.floor((i / size) * repeat * S) % S) * 4, to = (j * size + i) * 4;
    buffer[to] = smoke[from]; buffer[to + 1] = smoke[from + 1]; buffer[to + 2] = smoke[from + 2];
    buffer[to + 3] = smoke[from + 3] * alpha(Math.hypot(i / size - 0.5, j / size - 0.5) * 2);
  }
  await sharp(buffer, { raw: { width: size, height: size, channels: 4 } }).webp({ quality: 58, alphaQuality: 60 }).toFile(`${out}${file}`);
};
await shaped(1024, 3, (r) => smooth(0.2, 0.4, r) * (1 - smooth(0.72, 1, r)), "ring.webp");
await shaped(320, 1, (r) => 1 - smooth(0.3, 1, r), "puff.webp");
console.log("public/fx/ : smoke.webp, ring.webp, puff.webp");
