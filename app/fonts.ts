import { Shippori_Mincho_B1, Zen_Kaku_Gothic_New } from "next/font/google";
import localFont from "next/font/local";

// Titres
export const shippori = Shippori_Mincho_B1({
  weight: ["700", "800"],
  subsets: ["latin"],
  variable: "--font-shippori",
  display: "swap",
});

// Texte et chiffres (tabulaires via font-variant-numeric)
export const zenKaku = Zen_Kaku_Gothic_New({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-zen-kaku",
  display: "swap",
});

// Kanji des sceaux : sous-ensemble généré par scripts/subset-seal-font.mts
export const yujiSyuku = localFont({
  src: "./fonts/yuji-syuku-sceaux.woff2",
  variable: "--font-yuji-syuku",
  display: "block",
  preload: true,
});

export const fontVariables = `${shippori.variable} ${zenKaku.variable} ${yujiSyuku.variable}`;
