// Vignettes des thèmes de vitrine (public/vitrines/<thème>/thumb-v<version>.webp), réduites depuis l'image fixe 3:4 du
// thème (still-mobile-v<version>.webp, 1086 × 1448, refaite par npm run vitrines:assets).
//   npm run vitrines:thumbs   (à relancer après npm run vitrines:assets)
// Le choix du thème (vignettes de 68 px de haut) et l'étagère du profil (cartes de 160 px de large) affichaient
// l'image fixe entière : 900 Ko pour les sept vignettes du sélecteur. 480 px de large couvrent ces deux tailles sur un
// écran à 3 pixels par point. La vignette porte la version de l'image fixe ; les anciennes sont retirées.
import { readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const WIDTH = 480;
const ROOT = path.join(import.meta.dirname, "..");
const DIR = path.join(ROOT, "public", "vitrines");

let before = 0;
let after = 0;
for (const theme of readdirSync(DIR)) {
  const dir = path.join(DIR, theme);
  const still = readdirSync(dir).find((name) => /^still-mobile-v\d+\.webp$/.test(name));
  if (!still) continue;
  const version = /-v(\d+)\.webp$/.exec(still)[1];
  const name = `thumb-v${version}.webp`;
  const buffer = await sharp(path.join(dir, still)).resize({ width: WIDTH }).webp({ quality: 78, effort: 6 }).toBuffer();
  writeFileSync(path.join(dir, name), buffer);
  for (const old of readdirSync(dir)) if (/^thumb-v\d+\.webp$/.test(old) && old !== name) unlinkSync(path.join(dir, old));
  before += statSync(path.join(dir, still)).size;
  after += buffer.length;
  console.log(`${theme} : ${name}, ${(buffer.length / 1024).toFixed(1)} Ko`);
}
console.log(`Images fixes ${(before / 1024).toFixed(0)} Ko → vignettes ${(after / 1024).toFixed(0)} Ko`);
