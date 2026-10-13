// Génère app/fonts/yuji-syuku-sceaux.woff2 : Yuji Syuku réduite aux kanji de
// lib/seal-glyphs.ts (quelques Ko au lieu de plusieurs Mo).
// Source : fonts/source/YujiSyuku-Regular.ttf (google/fonts, licence OFL).
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import subsetFont from "subset-font";
import { SEAL_GLYPHS } from "../lib/seal-glyphs.ts";

const SOURCE = resolve("fonts/source/YujiSyuku-Regular.ttf");
const OUTPUT = resolve("app/fonts/yuji-syuku-sceaux.woff2");

const glyphs = [...new Set(SEAL_GLYPHS)].join("");
const source = await readFile(SOURCE);
const subset = await subsetFont(source, glyphs, { targetFormat: "woff2" });
await writeFile(OUTPUT, subset);

console.log(`${glyphs.length} glyphes → ${OUTPUT} (${(subset.length / 1024).toFixed(1)} Ko)`);
