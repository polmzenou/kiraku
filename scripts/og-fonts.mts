// Génère server/og/fonts/*.ttf : les polices du site en TrueType pour les images de partage
// (Satori, le moteur de next/og, ne lit pas le WOFF2). Mêmes sous-ensembles latins que app/fonts ;
// Yuji Syuku repart de la source pour ajouter les kanji des cadres d'avatar.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import subsetFont from "subset-font";
import { FRAME_KANJI } from "../lib/profile/frames.ts";
import { SEAL_GLYPHS } from "../lib/seal-glyphs.ts";

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => String.fromCodePoint(from + i)).join("");
const LATIN = `${range(0x20, 0x7e)}${range(0xa0, 0xff)}ŒœŸ’‘“”«»–—…·€ `;
const KANJI = [...new Set([...SEAL_GLYPHS, ...Object.values(FRAME_KANJI).join("")])].join("");

const FONTS: { name: string; source: string; text: string }[] = [
  { name: "dela-gothic-one-400-latin", source: "app/fonts/dela-gothic-one-400-latin.woff2", text: LATIN },
  { name: "shippori-mincho-b1-800-latin", source: "app/fonts/shippori-mincho-b1-800-latin.woff2", text: LATIN },
  { name: "zen-kaku-gothic-new-500-latin", source: "app/fonts/zen-kaku-gothic-new-500-latin.woff2", text: LATIN },
  { name: "zen-kaku-gothic-new-700-latin", source: "app/fonts/zen-kaku-gothic-new-700-latin.woff2", text: LATIN },
  { name: "yuji-syuku-og", source: "fonts/source/YujiSyuku-Regular.ttf", text: KANJI },
];

for (const font of FONTS) {
  const ttf = await subsetFont(await readFile(resolve(font.source)), font.text, { targetFormat: "sfnt" });
  const output = resolve(`server/og/fonts/${font.name}.ttf`);
  await writeFile(output, ttf);
  console.log(`${font.name} → ${output} (${(ttf.length / 1024).toFixed(1)} Ko)`);
}
