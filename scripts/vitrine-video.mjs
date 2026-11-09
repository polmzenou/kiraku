// Fonds vidéo des thèmes de vitrine (public/vitrines/<thème>/), refaits depuis les fichiers générés
// (dossier « vitrine background » : boucle et image fixe de chaque thème, en 3x4 et 16x9, voir THEMES).
//   npm run vitrines:assets [-- <thème>…] [-- "<dossier source>"]   (sans thème : tous)
// Boucle sans à-coup : si la dernière image recopie la première, elle est retirée, puis la fin est
// fondue sur 12 images dans le début. La jointure est vérifiée sur la sortie non compressée : elle doit
// valoir le pas naturel de la source. Images fixes en WebP de 350 Ko au plus. Demande ffmpeg et ffprobe.
// Les fichiers produits portent la version du thème (loop-mobile-v2.mp4…) ; les autres versions du
// dossier sont retirées une fois les nouvelles écrites.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

/**
 * Fichiers sources de chaque thème ({f} vaut 3x4 ou 16x9) et version des fichiers produits : la relever
 * quand un fond change, ici et dans lib/showcase/theme-registry.ts (le navigateur garde un fichier une semaine).
 */
const THEMES = [
  { id: "byobu", version: 2, video: "byobu-vitrine-{f}-loop.mp4", image: "byobu-vitrine-{f}.png" },
  { id: "tokonoma", version: 2, video: "tokonoma-vitrine-{f}-loop.mp4", image: "tokonoma-vitrine-{f}.png" },
  { id: "urushi", version: 2, video: "urushi-vitrine-{f}-loop.mp4", image: "urushi-vitrine-{f}.png" },
  { id: "ema", version: 2, video: "ema-vitrine-{f}-loop.mp4", image: "ema-vitrine-{f}.png" },
  { id: "black-edition", version: 1, video: "black-edition-vitrine-{f}-loop.mp4", image: "black-edition-vitrine-{f}.png" },
  { id: "eclat", version: 1, video: "eclat-vitrine-{f}-loop.mp4", image: "eclat-vitrine-{f}.png" },
  { id: "gold", version: 1, video: "gold-obsidienne-kintsugi-{f}-loop.mp4", image: "gold-obsidienne-kintsugi-{f}-v2.png" },
];
/** Fichiers que ce script produit, toutes versions confondues. */
const GENERATED = /^(loop|still)-(mobile|desktop)-v\d+\.(mp4|webp)$/;
const FORMATS = [
  { source: "3x4", target: "mobile" },
  { source: "16x9", target: "desktop" },
];
/** Images du fondu entre la fin et le début de la boucle. */
const T = 12;
const FPS = 24;
const STILL_MAX_BYTES = 350_000;
/** Écart toléré (dB) entre la jointure et le pas naturel de la source. */
const SEAM_TOLERANCE = 0.5;

const ROOT = path.join(import.meta.dirname, "..");
// Arguments : des identifiants de thème (pour n'en refaire que certains) et, au besoin, le dossier source
const args = process.argv.slice(2);
const isTheme = (arg) => THEMES.some((t) => t.id === arg);
const only = args.filter(isTheme);
const sourceDir = path.resolve(args.find((arg) => !isTheme(arg)) ?? path.join(homedir(), "Downloads", "vitrine background"));
// Les fichiers de mesure sont écrits en chemin relatif : « C:\… » casserait la syntaxe des filtres
const work = mkdtempSync(path.join(tmpdir(), "vitrine-video-"));

function run(cmd, args) {
  const res = spawnSync(cmd, args, { cwd: work, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (res.error) throw new Error(`${cmd} introuvable : installe ffmpeg (ffmpeg et ffprobe dans le PATH)`);
  if (res.status !== 0) throw new Error(`${cmd} a échoué :\n${res.stderr}`);
  return res.stdout;
}

function frameCount(file) {
  return Number(run("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", file]).trim());
}

/** Valeurs psnr_avg d'un fichier de statistiques (Infinity pour deux images identiques). */
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

/** PSNR entre l'image `a` et l'image `b` d'une vidéo. */
function framePsnr(file, a, b) {
  run("ffmpeg", [
    "-v", "error", "-i", file, "-i", file, "-lavfi",
    `[0:v]trim=start_frame=${a}:end_frame=${a + 1},setpts=PTS-STARTPTS[x];[1:v]trim=start_frame=${b}:end_frame=${b + 1},setpts=PTS-STARTPTS[y];[x][y]psnr=stats_file=pair.log`,
    "-f", "null", "-",
  ]);
  return psnrValues("pair.log")[0];
}

/**
 * Boucle de `total - T` images : la source à partir de l'image T + 1, puis ses T dernières images
 * fondues dans les images 0 à T - 1, et enfin l'image T. On reboucle sur l'image T + 1.
 */
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

/** Jointure fin → début et pas le plus fort de la boucle, mesurés avant compression. */
function measureLoop(source, total) {
  const out = total - T;
  run("ffmpeg", [
    "-v", "error", "-i", source, "-filter_complex",
    `${loopGraph(total)},split=4[o1][o2][o3][o4];` +
      `[o1]trim=end_frame=${out - 1},setpts=PTS-STARTPTS[a];[o2]trim=start_frame=1,setpts=PTS-STARTPTS[b];[a][b]psnr=stats_file=steps.log[x];` +
      `[o3]trim=start_frame=${out - 1},setpts=PTS-STARTPTS[c];[o4]trim=end_frame=1,setpts=PTS-STARTPTS[d];[c][d]psnr=stats_file=seam.log[y]`,
    "-map", "[x]", "-f", "null", "-", "-map", "[y]", "-f", "null", "-",
  ]);
  const steps = psnrValues("steps.log");
  return { seam: psnrValues("seam.log")[0], worstStep: Math.min(...steps) };
}

function buildLoop(source, target) {
  const frames = frameCount(source);
  // Une boucle générée finit souvent sur une copie exacte de sa première image : elle ferait un arrêt
  const duplicated = framePsnr(source, frames - 1, 0) === Infinity;
  const total = duplicated ? frames - 1 : frames;
  if (total < 2 * T + 2) throw new Error(`${source} : trop court pour un fondu de ${T} images`);

  const natural = framePsnr(source, T, T + 1);
  const { seam, worstStep } = measureLoop(source, total);
  const gap = seam === natural ? 0 : Math.abs(seam - natural);
  if (!(gap <= SEAM_TOLERANCE)) throw new Error(`${source} : jointure ${seam.toFixed(2)} dB, pas naturel ${natural.toFixed(2)} dB`);

  run("ffmpeg", [
    "-v", "error", "-y", "-i", source, "-filter_complex", `${loopGraph(total)}[o]`, "-map", "[o]",
    "-frames:v", String(total - T), "-an", "-c:v", "libx264", "-profile:v", "high", "-preset", "slow", "-crf", "19",
    "-x264-params", "aq-mode=3", "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart", target,
  ]);
  const written = frameCount(target);
  if (written !== total - T) throw new Error(`${target} : ${written} images au lieu de ${total - T}`);
  return { frames, duplicated, written, natural, seam, worstStep };
}

function buildStill(source, target) {
  for (let quality = 88; quality >= 40; quality -= 4) {
    run("ffmpeg", ["-v", "error", "-y", "-i", source, "-c:v", "libwebp", "-quality", String(quality), "-compression_level", "6", target]);
    if (statSync(target).size <= STILL_MAX_BYTES) return quality;
  }
  throw new Error(`${source} : impossible de descendre sous ${STILL_MAX_BYTES} octets`);
}

const kb = (file) => `${Math.round(statSync(file).size / 1024)} Ko`;
const db = (v) => (v === Infinity ? "∞" : `${v.toFixed(2)} dB`);

try {
  console.log(`Source : ${sourceDir}`);
  for (const { id: theme, version, video: videoName, image: imageName } of THEMES.filter((t) => only.length === 0 || only.includes(t.id))) {
    const dir = path.join(ROOT, "public", "vitrines", theme);
    mkdirSync(dir, { recursive: true });
    const written = new Set();
    for (const { source, target } of FORMATS) {
      const video = path.join(sourceDir, videoName.replace("{f}", source));
      const image = path.join(sourceDir, imageName.replace("{f}", source));
      for (const file of [video, image]) if (!existsSync(file)) throw new Error(`Fichier source manquant : ${file}`);

      const loop = path.join(dir, `loop-${target}-v${version}.mp4`);
      const still = path.join(dir, `still-${target}-v${version}.webp`);
      const r = buildLoop(video, loop);
      const quality = buildStill(image, still);
      written.add(path.basename(loop)).add(path.basename(still));
      console.log(
        `${theme} ${target} v${version} : ${r.frames} images${r.duplicated ? " (dernière = première, retirée)" : ""} → ${r.written} images, ` +
          `${(r.written / FPS).toFixed(2)} s, ${kb(loop)} | jointure ${db(r.seam)} (pas naturel ${db(r.natural)}), ` +
          `pas le plus fort ${db(r.worstStep)} | image fixe q${quality}, ${kb(still)}`,
      );
    }
    for (const name of readdirSync(dir)) {
      if (!GENERATED.test(name) || written.has(name)) continue;
      rmSync(path.join(dir, name));
      console.log(`${theme} : ancienne version retirée (${name})`);
    }
  }
} catch (error) {
  console.error(`\n✗ ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
