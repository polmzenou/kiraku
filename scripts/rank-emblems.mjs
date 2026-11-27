// Emblèmes des rangs du classé pour le site (public/ranks/<rang>-<largeur>-v<version>.webp), réduits depuis les PNG de
// public/ranks/ (360 × 420, 55 à 75 Ko chacun).
//   npm run ranks:assets
// Les PNG restent la source et servent tels quels à l'image Discord des saisons (server/discord/season-image.tsx). Le
// site les affichait de 28 à 88 px : une ligne du classement chargeait 62 Ko en moyenne pour un emblème de 28 px.
// Deux largeurs, choisies par components/ranked/RankEmblem.tsx selon la taille affichée (écran à 3 pixels par point) :
// 128 px jusqu'à 42 px affichés, 264 px au-delà (88 px au plus aujourd'hui).
// Les fichiers portent la version V : la relever quand un emblème change (le navigateur garde /ranks une semaine,
// next.config.ts), ici et dans lib/ranked/artwork.ts (RANK_EMBLEM_VERSION).
import { readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const V = 1;
const WIDTHS = [128, 264];
const ROOT = path.join(import.meta.dirname, "..");
const DIR = path.join(ROOT, "public", "ranks");
const GENERATED = /^.+-\d+-v\d+\.webp$/;

// Anciennes versions retirées : seules les sorties de ce script portent ce motif
for (const file of readdirSync(DIR)) if (GENERATED.test(file) && !file.endsWith(`-v${V}.webp`)) unlinkSync(path.join(DIR, file));

let source = 0;
let total = 0;
const pngs = readdirSync(DIR).filter((file) => file.endsWith(".png"));
for (const file of pngs) {
  const input = path.join(DIR, file);
  source += statSync(input).size;
  for (const width of WIDTHS) {
    const buffer = await sharp(input).resize({ width }).webp({ quality: 82, alphaQuality: 90, effort: 6 }).toBuffer();
    writeFileSync(path.join(DIR, `${path.basename(file, ".png")}-${width}-v${V}.webp`), buffer);
    total += buffer.length;
  }
}
console.log(`${pngs.length} emblèmes : ${(source / 1024).toFixed(0)} Ko de PNG → ${(total / 1024).toFixed(0)} Ko de WebP (${pngs.length * WIDTHS.length} fichiers)`);
