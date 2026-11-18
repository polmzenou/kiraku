// Images et vidéos du prestige (public/prestige/), refaites depuis les fichiers générés (dossier « prestige background » :
// prompt-prestige.md et les 44 fichiers livrés, voir ASSETS).
//   npm run prestige:assets [-- --all] [-- --out <dossier>] [-- "<dossier source>"]
// Sans --all, seulement ce que le jeu affiche ; --all ajoute les variantes de l'atelier D pas encore retenues
// (avec --out, pour les maquettes, sans toucher au dépôt).
// - Scènes : image fixe en WebP de 350 Ko au plus ; boucle vidéo traitée comme celles des vitrines
//   (scripts/vitrine-video.mjs : dernière image dupliquée retirée, fin fondue dans le début, jointure vérifiée).
// - Objets détourés : WebP avec transparence (un fond vert uni #00FF00 est aussi détouré).
// - Effets de lumière livrés sur fond noir, texture d'encre livrée sur fond blanc : leur fond devient transparent,
//   pour s'afficher dans les deux thèmes sans mode de fusion.
// Les fichiers produits portent la version V (…-v1.webp) : la relever quand une image change (le navigateur garde
// /prestige une semaine, next.config.ts). Demande ffmpeg et ffprobe pour les vidéos.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

const V = 1;

/**
 * kind : scene (image fixe), loop (boucle vidéo), alpha (objet détouré), light (lumière sur noir), ink (encre sur blanc),
 * tile (texture raccordable, opaque). width : largeur produite (hauteur au même rapport). game : affiché par le jeu ;
 * sinon, variante de l'atelier D, produite seulement avec --all.
 */
const ASSETS = [
  // Rite de renaissance (bain d'encre) : la boucle livrée est figée, l'image fixe suffit
  { kind: "scene", src: "rite-renaissance-9x16.png", out: "rite/still-mobile", game: true },
  { kind: "scene", src: "rite-renaissance-16x9.png", out: "rite/still-desktop", game: true },
  { kind: "alpha", src: "rite-pierre-a-encre.png", out: "fx/pierre-a-encre", width: 768, game: true },
  { kind: "light", src: "rite-onde-encre.png", out: "fx/onde-encre", width: 768, game: true },
  // En-tête du profil, révélation d'une gravée, page /prestige
  { kind: "light", src: "profil-poudre-or.png", out: "fx/poudre-or", width: 512, game: true },
  { kind: "alpha", src: "revelation-baren.png", out: "fx/baren", width: 384, game: true },
  { kind: "ink", src: "revelation-encre.png", out: "fx/encre-estampe", width: 384, quality: 70, game: true },
  { kind: "scene", src: "accueil-prestige-3x4.png", out: "accueil/still-mobile", game: true },
  { kind: "scene", src: "accueil-prestige-16x9.png", out: "accueil/still-desktop", game: true },
  // Sanctuaire et consécration (mise en place à choisir dans l'atelier D)
  { kind: "scene", src: "sanctuaire-3x4.png", out: "sanctuaire/still-mobile" },
  { kind: "scene", src: "sanctuaire-16x9.png", out: "sanctuaire/still-desktop" },
  { kind: "loop", src: "sanctuaire-3x4-loop.mp4", out: "sanctuaire/loop-mobile" },
  { kind: "loop", src: "sanctuaire-16x9-loop.mp4", out: "sanctuaire/loop-desktop" },
  { kind: "scene", src: "sanctuaire-portes-ouvertes-3x4.png", out: "sanctuaire/portes-mobile" },
  { kind: "scene", src: "sanctuaire-portes-ouvertes-16x9.png", out: "sanctuaire/portes-desktop" },
  { kind: "alpha", src: "sanctuaire-autel-gradins.png", out: "fx/autel-gradins", width: 1536 },
  { kind: "alpha", src: "sanctuaire-autel-table.png", out: "fx/autel-table", width: 1536 },
  { kind: "alpha", src: "sanctuaire-estrade.png", out: "fx/estrade", width: 1536 },
  { kind: "alpha", src: "sanctuaire-ratelier-ema.png", out: "fx/ratelier-ema", width: 1536 },
  { kind: "alpha", src: "sanctuaire-ema.png", out: "fx/ema", width: 384 },
  { kind: "light", src: "sanctuaire-halo.png", out: "fx/halo-nacre", width: 512 },
  { kind: "light", src: "consecration-rayon.png", out: "fx/rayon", width: 256 },
  { kind: "light", src: "consecration-eclat.png", out: "fx/eclat", width: 512 },
  { kind: "alpha", src: "consecration-suzu.png", out: "fx/suzu", width: 256 },
  { kind: "alpha", src: "consecration-petales.png", out: "fx/petales", width: 512 },
  // Rouleaux des cycles (forme à choisir dans l'atelier D)
  { kind: "alpha", src: "rouleau-ferme-violet.png", out: "fx/rouleau-violet", width: 768 },
  { kind: "alpha", src: "rouleau-ferme-canard.png", out: "fx/rouleau-canard", width: 768 },
  { kind: "alpha", src: "rouleau-ferme-carmin.png", out: "fx/rouleau-carmin", width: 768 },
  { kind: "alpha", src: "rouleau-ferme-vert.png", out: "fx/rouleau-vert", width: 768 },
  { kind: "tile", src: "rouleau-papier.png", out: "fx/rouleau-papier", width: 1024 },
  { kind: "alpha", src: "rouleau-baguette.png", out: "fx/rouleau-baguette", width: 96 },
  { kind: "alpha", src: "rouleau-boite-fermee.png", out: "fx/boite-fermee", width: 512 },
  { kind: "alpha", src: "rouleau-boite-ouverte.png", out: "fx/boite-ouverte", width: 512 },
  // Nuées d'or de l'en-tête (style à choisir dans l'atelier D)
  { kind: "alpha", src: "profil-nuees-kasumi-1.png", out: "fx/kasumi-1", width: 1024 },
  { kind: "alpha", src: "profil-nuees-kasumi-2.png", out: "fx/kasumi-2", width: 1024 },
  { kind: "alpha", src: "profil-nuees-kasumi-3.png", out: "fx/kasumi-3", width: 1024 },
  { kind: "alpha", src: "profil-nuees-zuiun-1.png", out: "fx/zuiun-1", width: 512 },
  { kind: "alpha", src: "profil-nuees-zuiun-2.png", out: "fx/zuiun-2", width: 512 },
  { kind: "alpha", src: "profil-nuees-zuiun-3.png", out: "fx/zuiun-3", width: 512 },
  { kind: "light", src: "profil-nuees-raigo-rayons.png", out: "fx/raigo-rayons", width: 1024 },
  { kind: "light", src: "profil-nuees-raigo-nuages.png", out: "fx/raigo-nuages", width: 1024 },
  { kind: "light", src: "profil-nuees-raigo-halo.png", out: "fx/raigo-halo", width: 512 },
];

/** Images du fondu entre la fin et le début d'une boucle (comme les vitrines). */
const T = 12;
const FPS = 24;
const STILL_MAX_BYTES = 350_000;
const SEAM_TOLERANCE = 0.5;

const ROOT = path.join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const all = args.includes("--all");
const outArg = args.indexOf("--out");
const outDir = outArg >= 0 ? path.resolve(args[outArg + 1]) : path.join(ROOT, "public", "prestige");
const sourceDir = path.resolve(args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--out") ?? path.join(homedir(), "Downloads", "prestige background"));
// Les fichiers de mesure sont écrits en chemin relatif : « C:\… » casserait la syntaxe des filtres
const work = mkdtempSync(path.join(tmpdir(), "prestige-assets-"));

function run(cmd, cmdArgs) {
  const res = spawnSync(cmd, cmdArgs, { cwd: work, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (res.error) throw new Error(`${cmd} introuvable : installe ffmpeg (ffmpeg et ffprobe dans le PATH)`);
  if (res.status !== 0) throw new Error(`${cmd} a échoué :\n${res.stderr}`);
  return res.stdout;
}

function frameCount(file) {
  return Number(run("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", file]).trim());
}

function psnrValues(name) {
  return readFileSync(path.join(work, name), "utf8")
    .trim()
    .split("\n")
    .map((line) => {
      const value = /psnr_avg:(\S+)/.exec(line)?.[1];
      if (!value) throw new Error(`Statistiques PSNR illisibles : ${line}`);
      return value === "inf" ? Infinity : Number(value);
    });
}

function framePsnr(file, a, b) {
  run("ffmpeg", [
    "-v", "error", "-i", file, "-i", file, "-lavfi",
    `[0:v]trim=start_frame=${a}:end_frame=${a + 1},setpts=PTS-STARTPTS[x];[1:v]trim=start_frame=${b}:end_frame=${b + 1},setpts=PTS-STARTPTS[y];[x][y]psnr=stats_file=pair.log`,
    "-f", "null", "-",
  ]);
  return psnrValues("pair.log")[0];
}

/** Boucle de `total - T` images : la source à partir de l'image T + 1, puis ses T dernières images fondues dans les premières. */
function loopGraph(total) {
  const m = total - 2 * T - 1;
  const w = `clip((N-${m - 1})/${T + 1},0,1)`;
  return (
    `[0:v]trim=end_frame=${total},setpts=PTS-STARTPTS,split=2[s1][s2];` +
    `[s1]trim=start_frame=${T + 1},setpts=PTS-STARTPTS,tpad=stop=1:stop_mode=clone[p];` +
    `[s2]trim=end_frame=${T + 1},setpts=PTS-STARTPTS,tpad=start=${m}:start_mode=clone[q];` +
    `[p][q]blend=all_expr='A*(1-${w})+B*${w}',format=yuv420p,trim=end_frame=${total - T}`
  );
}

function measureSeam(source, total) {
  const out = total - T;
  run("ffmpeg", [
    "-v", "error", "-i", source, "-filter_complex",
    `${loopGraph(total)},split=2[o3][o4];[o3]trim=start_frame=${out - 1},setpts=PTS-STARTPTS[c];[o4]trim=end_frame=1,setpts=PTS-STARTPTS[d];[c][d]psnr=stats_file=seam.log[y]`,
    "-map", "[y]", "-f", "null", "-",
  ]);
  return psnrValues("seam.log")[0];
}

function buildLoop(source, target) {
  const frames = frameCount(source);
  // Une boucle générée finit souvent sur une copie exacte de sa première image : elle ferait un arrêt
  const duplicated = framePsnr(source, frames - 1, 0) === Infinity;
  const total = duplicated ? frames - 1 : frames;
  if (total < 2 * T + 2) throw new Error(`${source} : trop court pour un fondu de ${T} images`);
  // Jointure au moins aussi douce que le pas naturel de la source (à la tolérance près) ; une source presque figée
  // peut la rendre plus douce encore, ce qui ne se voit pas
  const natural = framePsnr(source, T, T + 1);
  const seam = measureSeam(source, total);
  if (!(seam >= natural - SEAM_TOLERANCE)) throw new Error(`${source} : jointure ${seam.toFixed(2)} dB, pas naturel ${natural.toFixed(2)} dB`);
  run("ffmpeg", [
    "-v", "error", "-y", "-i", source, "-filter_complex", `${loopGraph(total)}[o]`, "-map", "[o]",
    "-frames:v", String(total - T), "-an", "-c:v", "libx264", "-profile:v", "high", "-preset", "slow", "-crf", "21",
    "-x264-params", "aq-mode=3", "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart", target,
  ]);
  return `${total - T} images`;
}

async function buildStill(source, target) {
  for (let quality = 86; quality >= 40; quality -= 4) {
    await sharp(source).webp({ quality, effort: 6 }).toFile(target);
    if (statSync(target).size <= STILL_MAX_BYTES) return `q${quality}`;
  }
  throw new Error(`${source} : impossible de descendre sous ${STILL_MAX_BYTES} octets`);
}

/** Pixels RGBA d'une source redimensionnée ; pour un objet livré sans transparence, le fond vert uni est détouré. */
async function rgba(source, width, keyGreen) {
  const { data, info } = await sharp(source).resize({ width }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (keyGreen && (await sharp(source).stats()).isOpaque) {
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const green = g - Math.max(r, b);
      if (green > 60) {
        // Fond vert : transparent ; bord vert : atténué et désaturé
        data[i + 3] = Math.max(0, 255 - Math.round((green - 60) * 2.5));
        data[i + 1] = Math.max(r, b);
      }
    }
  }
  return { data, info };
}

/** Lumière sur fond noir → transparence : l'alpha est la valeur la plus forte, la couleur est dé-prémultipliée. */
function lightToAlpha(data) {
  for (let i = 0; i < data.length; i += 4) {
    const a = Math.max(data[i], data[i + 1], data[i + 2]);
    const alpha = a < 6 ? 0 : a;
    for (let c = 0; c < 3; c++) data[i + c] = alpha ? Math.min(255, Math.round((data[i + c] * 255) / a)) : 0;
    data[i + 3] = alpha;
  }
}

/** Encre sur fond blanc → transparence : une encre sumi dont l'opacité suit la noirceur. */
function inkToAlpha(data) {
  for (let i = 0; i < data.length; i += 4) {
    const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    const alpha = Math.max(0, Math.round(255 - luma - 3));
    data[i] = 24;
    data[i + 1] = 19;
    data[i + 2] = 15;
    data[i + 3] = alpha;
  }
}

async function buildSprite({ kind, width, quality = 84 }, source, target) {
  if (kind === "tile") {
    await sharp(source).resize({ width }).webp({ quality, effort: 6 }).toFile(target);
    return "opaque";
  }
  const { data, info } = await rgba(source, width, kind === "alpha");
  if (kind === "light") lightToAlpha(data);
  if (kind === "ink") inkToAlpha(data);
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).webp({ quality, alphaQuality: Math.min(90, quality + 6), effort: 6 }).toFile(target);
  return `${info.width} × ${info.height}`;
}

const kb = (file) => `${Math.round(statSync(file).size / 1024)} Ko`;

try {
  console.log(`Source : ${sourceDir}\nSortie : ${outDir}${all ? " (toutes les variantes)" : ""}`);
  for (const asset of ASSETS.filter((a) => all || a.game)) {
    const source = path.join(sourceDir, asset.src);
    if (!existsSync(source)) throw new Error(`Fichier source manquant : ${source}`);
    const target = path.join(outDir, `${asset.out}-v${V}.${asset.kind === "loop" ? "mp4" : "webp"}`);
    mkdirSync(path.dirname(target), { recursive: true });
    const detail =
      asset.kind === "loop" ? buildLoop(source, target) : asset.kind === "scene" ? await buildStill(source, target) : await buildSprite(asset, source, target);
    console.log(`${path.relative(outDir, target)} : ${detail}, ${kb(target)}`);
  }
} catch (error) {
  console.error(`\n✗ ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
