// Cadres d'avatar des rangs du classé (public/frames/), refaits depuis les PNG livrés (zip « kiraku-cadres-combat » :
// manifest.json, cadres/<rang>.png en 1254 px RGBA, prompts-generation.json).
//   npm run frames:assets [-- "<dossier du zip ou son dossier cadres>"]
// Pour chaque cadre :
// - le voile presque transparent (alpha < HAZE) est effacé : il alourdit le fichier et laisse un halo ;
// - l'ouverture ronde est mesurée (rayons lancés depuis le centre, cercle ajusté sur les bords réguliers, les pointes
//   de cimier écartées), puis l'image est recadrée en carré centré sur elle : l'avatar tombe pile au milieu ;
// - sorties en 192 et 384 px, AVIF (30 Ko au plus) et WebP de secours (40 Ko au plus), qualité abaissée au besoin ;
// - lib/profile/frame-art.ts reçoit l'échelle de chaque cadre (côté de l'image / diamètre de l'avatar).
// Les fichiers portent la version V (…-v1.avif) : la relever quand une image change (le navigateur garde /frames une
// semaine, next.config.ts).
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import sharp from "sharp";

const V = 1;
const WIDTHS = [192, 384];
/** Poids maximal par fichier : le WebP ne sert qu'aux navigateurs sans AVIF, il a un peu plus de marge. */
const MAX_BYTES = { avif: 30_000, webp: 40_000 };
/** Alpha en dessous duquel un pixel est du voile, pas du métal. */
const HAZE = 12;
/** L'avatar dépasse l'ouverture de 1,5 % : il passe sous le bord intérieur, sans liseré entre la photo et l'anneau. */
const OVERLAP = 1.015;
/** Marge transparente autour des ornements, en part du demi-côté. */
const MARGIN = 0.02;

/** Fichier livré → style de cadre (lib/profile/frames.ts), du plus bas au plus haut rang. */
const RANKS = [
  { file: "bronze", style: "rang-bronze" },
  { file: "argent", style: "rang-argent" },
  { file: "or", style: "rang-or" },
  { file: "emeraude", style: "rang-emeraude" },
  { file: "elite", style: "rang-elite" },
  { file: "champion", style: "rang-champion" },
  { file: "grand-champion", style: "rang-grand-champion" },
];

const ROOT = path.join(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public", "frames");
const GEOMETRY = path.join(ROOT, "lib", "profile", "frame-art.ts");
const arg = process.argv.slice(2).find((a) => !a.startsWith("--"));
const given = path.resolve(arg ?? path.join(homedir(), "Downloads", "kiraku-cadres-combat"));
const sourceDir = existsSync(path.join(given, "cadres")) ? path.join(given, "cadres") : given;

/** Cercle des moindres carrés (méthode de Kåsa) : x² + y² + Dx + Ey + F = 0. */
function fitCircle(points) {
  // Équations normales du système linéaire en D, E, F
  const m = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  for (const [x, y] of points) {
    const row = [x, y, 1];
    const rhs = -(x * x + y * y);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) m[i][j] += row[i] * row[j];
      m[i][3] += row[i] * rhs;
    }
  }
  // Pivot de Gauss
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k < 4; k++) m[r][k] -= f * m[c][k];
    }
  }
  const [D, E, F] = [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
  const cx = -D / 2;
  const cy = -E / 2;
  return { cx, cy, r: Math.sqrt(cx * cx + cy * cy - F) };
}

/** Bord intérieur de l'anneau vu depuis (cx, cy) : premier pixel opaque de chaque rayon. */
function innerEdge(data, width, height, cx, cy) {
  const points = [];
  for (let k = 0; k < 720; k++) {
    const t = (k * Math.PI) / 360;
    for (let r = 20; r < Math.min(width, height) / 2; r += 0.5) {
      const x = Math.round(cx + r * Math.cos(t));
      const y = Math.round(cy + r * Math.sin(t));
      if (x < 0 || y < 0 || x >= width || y >= height) break;
      if (data[(y * width + x) * 4 + 3] > 128) {
        points.push({ x, y, r });
        break;
      }
    }
  }
  return points;
}

/** Ouverture de l'avatar : cercle ajusté sur les rayons réguliers (20e au 80e centile), deux passes. */
function aperture(data, width, height) {
  let circle = { cx: width / 2, cy: height / 2, r: 0 };
  for (let pass = 0; pass < 2; pass++) {
    const edge = innerEdge(data, width, height, circle.cx, circle.cy).sort((a, b) => a.r - b.r);
    if (edge.length < 360) throw new Error("ouverture introuvable : le centre de l'image n'est pas transparent");
    const kept = edge.slice(Math.floor(edge.length * 0.2), Math.ceil(edge.length * 0.8));
    circle = fitCircle(kept.map((p) => [p.x, p.y]));
  }
  return circle;
}

/** Efface le voile et renvoie la boîte des pixels opaques. */
function clean(data, width, height) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < HAZE) {
        data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
        continue;
      }
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY };
}

/** Carré de côté `side` dont le coin est (left, top), complété de transparence hors de l'image. */
function cropSquare(data, width, height, left, top, side) {
  const out = Buffer.alloc(side * side * 4);
  for (let y = 0; y < side; y++) {
    const sy = top + y;
    if (sy < 0 || sy >= height) continue;
    const x0 = Math.max(0, -left);
    const x1 = Math.min(side, width - left);
    if (x1 <= x0) continue;
    data.copy(out, (y * side + x0) * 4, (sy * width + left + x0) * 4, (sy * width + left + x1) * 4);
  }
  return out;
}

/** Encode sous MAX_BYTES[format], en baissant la qualité par paliers. */
async function encode(square, side, width, format, target) {
  const steps = format === "avif" ? [60, 55, 50, 45, 40, 35] : [82, 78, 74, 70, 66, 62, 58];
  for (const quality of steps) {
    const resized = sharp(square, { raw: { width: side, height: side, channels: 4 } }).resize(width, width, { kernel: "lanczos3" });
    const buffer =
      format === "avif"
        ? await resized.avif({ quality, effort: 9 }).toBuffer()
        : await resized.webp({ quality, alphaQuality: quality, effort: 6, smartSubsample: true }).toBuffer();
    if (buffer.length <= MAX_BYTES[format]) {
      writeFileSync(target, buffer);
      return { quality, bytes: buffer.length };
    }
  }
  throw new Error(`${target} : impossible de descendre sous ${MAX_BYTES[format]} octets`);
}

mkdirSync(OUT, { recursive: true });
const scales = {};
let total = 0;
for (const { file, style } of RANKS) {
  const source = path.join(sourceDir, `${file}.png`);
  if (!existsSync(source)) throw new Error(`${source} introuvable (dossier du zip attendu en argument)`);
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const box = clean(data, width, height);
  const { cx, cy, r } = aperture(data, width, height);
  // Demi-côté : jusqu'au pixel opaque le plus éloigné du centre de l'ouverture, plus la marge
  const reach = Math.max(cx - box.minX, box.maxX + 1 - cx, cy - box.minY, box.maxY + 1 - cy);
  const side = Math.ceil(2 * reach * (1 + MARGIN));
  const left = Math.round(cx - side / 2);
  const top = Math.round(cy - side / 2);
  const square = cropSquare(data, width, height, left, top, side);
  const scale = side / (2 * r * OVERLAP);
  scales[style] = Math.round(scale * 10_000) / 10_000;
  const parts = [];
  for (const w of WIDTHS) {
    for (const format of ["avif", "webp"]) {
      const target = path.join(OUT, `${style}-${w}-v${V}.${format}`);
      const { quality, bytes } = await encode(square, side, w, format, target);
      total += statSync(target).size;
      parts.push(`${w} ${format} q${quality} ${(bytes / 1024).toFixed(1)} Ko`);
    }
  }
  console.log(
    `${style.padEnd(20)} ouverture (${cx.toFixed(1)}, ${cy.toFixed(1)}) r ${r.toFixed(1)} · côté ${side} · échelle ${scales[style]} · ${parts.join(" · ")}`,
  );
}
console.log(`Total ${(total / 1024).toFixed(0)} Ko pour ${RANKS.length * WIDTHS.length * 2} fichiers`);

const lines = Object.entries(scales).map(([style, scale]) => `  "${style}": ${scale},`);
writeFileSync(
  GEOMETRY,
  `// Généré par scripts/rank-frames.mjs (npm run frames:assets) : ne pas modifier à la main.
// Cadres illustrés : public/frames/<style>-<largeur>-v<version>.{avif,webp}, recadrés en carré centré sur l'ouverture.
// Échelle : côté de l'image / diamètre de l'avatar (l'avatar passe un peu sous le bord intérieur de l'anneau).

export const FRAME_ART_VERSION = ${V};

export const FRAME_ART_WIDTHS = [${WIDTHS.join(", ")}] as const;

export const FRAME_ART_SCALE = {
${lines.join("\n")}
} as const;
`,
);
console.log(`Échelles écrites dans ${path.relative(ROOT, GEOMETRY)}`);
