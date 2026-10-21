// Icônes PWA (manifest, notifications) : le sceau 気楽 de l'en-tête, rendu en PNG.
//   npx tsx scripts/generate-pwa-icons.mts
// À relancer seulement si le logo change ; les PNG sont versionnés dans public/icons.
import { readFile, writeFile } from "node:fs/promises";
import { createElement as h } from "react";
import { ImageResponse } from "next/og";

const font = await readFile(new URL("../fonts/source/YujiSyuku-Regular.ttf", import.meta.url));
const SHU = "#C8372D";
const PAPER = "#F3ECDF";

/** Sceau arrondi (favicon, manifest « any ») ; `inset` : marge autour du sceau. */
function seal(size: number, inset: number, background: string) {
  const inner = size - inset * 2;
  return h(
    "div",
    { style: { width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background } },
    h(
      "div",
      {
        style: {
          width: inner,
          height: inner,
          borderRadius: inner * 0.09,
          background: SHU,
          color: PAPER,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Yuji Syuku",
          fontSize: inner * 0.4,
          lineHeight: 1.05,
        },
      },
      h("span", null, "気"),
      h("span", null, "楽"),
    ),
  );
}

/**
 * Écran d'accueil (iOS, Android maskable) : vermillon bord à bord, sans coins ni fond sombre,
 * le système applique son propre masque. `glyph` : taille du kanji par rapport à l'icône.
 */
function fullSeal(size: number, glyph: number) {
  return h(
    "div",
    {
      style: {
        width: size,
        height: size,
        background: SHU,
        color: PAPER,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Yuji Syuku",
        fontSize: size * glyph,
        lineHeight: 1.05,
      },
    },
    h("span", null, "気"),
    h("span", null, "楽"),
  );
}

/** Badge Android : silhouette blanche sur transparent (le système la teinte). */
function badge(size: number) {
  return h(
    "div",
    {
      style: {
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#FFFFFF",
        fontFamily: "Yuji Syuku",
        fontSize: size * 0.82,
      },
    },
    "楽",
  );
}

async function render(file: string, node: ReturnType<typeof h>, size: number) {
  const res = new ImageResponse(node, { width: size, height: size, fonts: [{ name: "Yuji Syuku", data: font, style: "normal" }] });
  await writeFile(new URL(`../public/icons/${file}`, import.meta.url), Buffer.from(await res.arrayBuffer()));
  console.log(`public/icons/${file}`);
}

await render("icon-192.png", seal(192, 0, "transparent"), 192);
await render("icon-512.png", seal(512, 0, "transparent"), 512);
await render("maskable-512.png", fullSeal(512, 0.3), 512);
await render("apple-touch-icon.png", fullSeal(180, 0.36), 180);
await render("badge-96.png", badge(96), 96);
