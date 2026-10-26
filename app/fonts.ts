import localFont from "next/font/local";

// Titres h1 et h2. Une seule graisse : la plage 400–900 évite le faux gras sur font-bold/extrabold.
export const delaGothic = localFont({
  src: [{ path: "./fonts/dela-gothic-one-400-latin.woff2", weight: "400 900", style: "normal" }],
  adjustFontFallback: "Arial",
  variable: "--font-dela-gothic",
  display: "swap",
  preload: true,
});

// Titres secondaires (h3, logo, chiffres de classement)
export const shippori = localFont({
  src: [
    { path: "./fonts/shippori-mincho-b1-700-latin.woff2", weight: "700", style: "normal" },
    { path: "./fonts/shippori-mincho-b1-800-latin.woff2", weight: "800", style: "normal" },
  ],
  adjustFontFallback: "Times New Roman",
  variable: "--font-shippori",
  display: "swap",
  preload: true,
});

// Texte et chiffres (tabulaires via font-variant-numeric)
export const zenKaku = localFont({
  src: [
    { path: "./fonts/zen-kaku-gothic-new-400-latin.woff2", weight: "400", style: "normal" },
    { path: "./fonts/zen-kaku-gothic-new-500-latin.woff2", weight: "500", style: "normal" },
    { path: "./fonts/zen-kaku-gothic-new-700-latin.woff2", weight: "700", style: "normal" },
  ],
  adjustFontFallback: "Arial",
  variable: "--font-zen-kaku",
  display: "swap",
  preload: true,
});

// Kanji des sceaux : sous-ensemble généré par scripts/subset-seal-font.mts
export const yujiSyuku = localFont({
  src: "./fonts/yuji-syuku-sceaux.woff2",
  variable: "--font-yuji-syuku",
  display: "block",
  preload: false,
});

export const fontVariables = `${delaGothic.variable} ${shippori.variable} ${zenKaku.variable} ${yujiSyuku.variable}`;
