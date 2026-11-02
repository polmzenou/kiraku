// Génère components/fuda/FudaFace.css : la face des fuda « Les Nuées d'or » (Kin'un byōbu 金雲屏風).
// Les formes des nuées et leurs contours sont des masques SVG calculés ici (suites d'arcs en lobes), que
// chaque rareté colore par variables CSS : relancer `node scripts/fuda-face-css.mjs` après toute retouche.
import { writeFileSync } from "node:fs";

// Encodage minimal (guillemets simples dans le SVG, espaces gardés : l'URL est entre guillemets doubles)
const enc = (s) => `url("data:image/svg+xml,${s.replace(/[%#<>"{}|\\^`]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}")`;
const svg = (vb, body) => enc(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='${vb}' preserveAspectRatio='none'>${body}</svg>`);
const f1 = (n) => Math.round(n * 10) / 10;
const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const hash = (s) => {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return h >>> 0;
};
// Suite de lobes entre des points : arcs de rayon k × corde ; sweep 1 = bosse à gauche du sens de marche
const lobes = (pts, sweep, k = 0.6) => {
  let d = "";
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const r = f1(Math.hypot(x1 - x0, y1 - y0) * k);
    d += `A${r} ${r} 0 0 ${sweep} ${x1} ${y1}`;
  }
  return d;
};

// Banc de nuées (viewBox 956 × 520, étiré sur la largeur du papier et 44 cqw de haut)
const BANK_VB = "0 0 956 520";
const BANK_TOP = `M0 170${lobes([[0, 170], [64, 112], [166, 58], [284, 64], [372, 124], [408, 206]], 1)}L560 214${lobes([[560, 214], [606, 160], [694, 112], [800, 104], [884, 146], [932, 206], [956, 226]], 1)}`;
const BANK_INNER = `M0 262${lobes([[0, 262], [70, 214], [170, 180], [268, 198], [338, 252]], 1)}L540 252M956 300${lobes([[956, 300], [904, 256], [818, 224], [722, 228], [642, 272]], 0)}L470 272M424 232L566 232`;
const BANK_XS = "M0 520L0 392A170 170 0 0 1 300 352A150 150 0 0 1 560 382L640 392A180 180 0 0 1 956 362L956 520Z";
// Nuée du sceau (viewBox 320 × 300, boîte posée à −4 cqw du coin : marge pour la parallaxe)
const SEAL_VB = "0 0 320 300";
const SEAL_EDGE = `M250 0${lobes([[250, 0], [284, 72], [258, 146], [196, 206], [112, 250], [0, 268]], 1)}`;
const SEAL_INNER = `M0 193${lobes([[0, 193], [81, 180], [141, 148], [186, 105], [204, 52], [180, 0]], 0)}`;

// Contour moriage en masques (blanc = visible), colorés par la rareté : ombre, trait et bandes, rehaut ;
// en grand format, second trait et second rehaut décalés sous la crête
const W = 7;
const stroke = (d, w, attrs = "") => `<path d='${d}' fill='none' stroke='#fff' stroke-width='${w}' stroke-linecap='round' stroke-linejoin='round'${attrs}/>`;
const shape = (vb, d) => svg(vb, `<path d='${d}' fill='#fff' stroke='#fff' stroke-width='12' stroke-linejoin='round'/>`);
const shadow = (vb, edge) => svg(vb, stroke(edge, W + 4, " transform='translate(2.5 3.5)'"));
const line = (vb, edge, inner, big = false) =>
  svg(vb, stroke(edge, W) + stroke(inner, f1(W * 0.55), " stroke-opacity='.7'") + (big ? stroke(edge, 3, " stroke-opacity='.45' transform='translate(0 18)'") : ""));
const shine = (vb, edge, big = false) =>
  svg(vb, stroke(edge, f1(W * 0.32), " transform='translate(-1.2 -1.6)'") + (big ? stroke(edge, 1.6, " stroke-opacity='.5' transform='translate(0 21)'") : ""));
// Sunago et kirihaku : poudre et paillettes d'or semées près des crêtes (graine fixe)
const sunago = (() => {
  const r = rng(hash("bankLEGENDARY"));
  let dots = "";
  for (let i = 0; i < 90; i++) {
    const x = Math.round(r() * 956);
    const y = Math.round(20 + Math.pow(r(), 1.7) * 310);
    if (r() < 0.82) dots += `<circle cx='${x}' cy='${y}' r='${f1(1 + r() * 2.4)}'/>`;
    else {
      const s = Math.round(4 + r() * 7);
      dots += `<rect x='${x}' y='${y}' width='${s}' height='${s}' transform='rotate(${Math.round(r() * 90)} ${x} ${y})'/>`;
    }
  }
  return svg(BANK_VB, `<g fill='#fff'>${dots}</g>`);
})();
// AR : triple contour shu, kin et ai décalé (les fantômes de la révélation) et faille de lumière
const AR_LINES = svg(BANK_VB, `<g fill='none' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'><path d='${BANK_TOP}' stroke='#e0533f' stroke-opacity='.9' transform='translate(-11 -10)'/><path d='${BANK_TOP}' stroke='#e9cd78' transform='translate(5 -5)'/><path d='${BANK_TOP}' stroke='#7fa3d1' stroke-opacity='.95' transform='translate(13 9)'/></g>`);
const CRACK = "M598 150L586 214L606 268L590 342L612 410L600 520";
const AR_CRACK = svg(BANK_VB, `<path d='${CRACK}' fill='none' stroke='#fff6dc' stroke-opacity='.55' stroke-width='12' stroke-linejoin='round'/><path d='${CRACK}' fill='none' stroke='#fff' stroke-width='3' stroke-linejoin='round'/>`);
// Gold : coutures d'or (kintsugi des fissures de la révélation)
const SEAMS = (() => {
  const r = rng(hash("bankkin"));
  let d = "";
  for (let k = 0; k < 3; k++) {
    let x = 120 + k * 330 + r() * 80;
    let y = 520;
    d += `M${f1(x)} ${y}`;
    while (y > 40) {
      y -= 30 + r() * 46;
      x += (r() - 0.5) * 70;
      d += `L${f1(x)} ${f1(y)}`;
    }
  }
  return svg(BANK_VB, `<path d='${d}' fill='none' stroke='#5a3f0a' stroke-opacity='.55' stroke-width='7' stroke-linejoin='round'/><path d='${d}' fill='none' stroke='#f3d98a' stroke-width='3.6' stroke-linejoin='round'/><path d='${d}' fill='none' stroke='#fffbe8' stroke-width='1.2' stroke-linejoin='round' transform='translate(-.8 -.8)'/>`);
})();

// Raretés visuelles (MR, VR, BR) : croissant dans la nuée du sceau et coins ornés des plaques
const crescent = (color) => svg(SEAL_VB, `<path d='M250 0${lobes([[250, 0], [284, 72], [258, 146], [196, 206]], 1)}' fill='none' stroke='${color}' stroke-width='9' stroke-linecap='round' transform='translate(-24 -18)'/>`);
const corner = (angle) => svg("0 0 20 20", `<path d='M1 19V10C6 10 10 6 10 1H19' fill='none' stroke='#b3261e' stroke-width='1.5' stroke-linecap='round' transform='rotate(${angle} 10 10)'/>`);
const corners = (size, gap) => [[0, "left", "top"], [90, "right", "top"], [180, "right", "bottom"], [270, "left", "bottom"]]
  .map(([angle, x, y]) => `${corner(angle)} ${x} ${gap} ${y} ${gap} / ${size} ${size} no-repeat`).join(", ");

const NONE = "linear-gradient(transparent, transparent)";
const MAT = "var(--fuda-frame-bg, var(--fuda-frame))";
// Le banc et la nuée du sceau prennent la matière du cadre, sauf si la rareté leur en donne une autre
const BANK_MAT = `var(--kn-bank-bg, ${MAT})`;
const SEAL_MAT = `var(--kn-sc-bg, ${MAT})`;
const VOL = "linear-gradient(180deg, rgb(255 255 255 / .17), transparent 34%, transparent 62%, rgb(0 0 0 / .16))";
const JP = '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';
// Papier du shikishi : un papier choisi dans l'admin remplace le dégradé par sa couleur (--kn-washi)
const WASHI = "var(--kn-washi, radial-gradient(130% 150% at 50% 0%, #fcf8ef, var(--kn-paper) 55%, #ebe2cd))";
const mask = (m) => `mask: ${m} 0 0 / 100% 100% no-repeat;`;
const layer = (v) => `var(${v}, ${NONE}) 0 0 / 100% 100% no-repeat`;
const drift = (x, y) => `translate: calc((var(--mx, .5) - .5) * ${x}cqw) calc((var(--my, .5) - .5) * ${y}cqw); transition: translate 180ms ease-out;`;
const TANZAKU = `radial-gradient(160% 16% at 30% -2%, rgb(40 72 150 / .66), rgb(40 72 150 / .2) 58%, transparent 78%),
    radial-gradient(120% 9% at 78% 13%, rgb(40 72 150 / .22), transparent 70%),
    radial-gradient(160% 15% at 70% 102%, rgb(112 62 142 / .6), rgb(112 62 142 / .18) 58%, transparent 78%),
    radial-gradient(120% 8% at 24% 87%, rgb(112 62 142 / .2), transparent 70%),
    repeating-linear-gradient(91deg, rgb(255 255 255 / .24) 0 1px, transparent 1px 3px),
    linear-gradient(#f9f3e7, #eee5d1)`;

// Encres du contour (trait, rehaut, ombre), poudre d'or et motif de matière, par rareté
const RARITIES = {
  COMMON: { line: "#2a241e", lo: 0.8, hi: "#fff", ho: 0.25, sh: "#000", so: 0.16, dot: "#3a332b", dotO: 0.4, extra: "--kn-seal: #8a8174;",
    detail: "repeating-linear-gradient(93deg, rgb(255 255 255 / .1) 0 1px, transparent 1px 8px), repeating-linear-gradient(178deg, rgb(40 30 20 / .07) 0 1px, transparent 1px 11px), radial-gradient(120% 70% at 30% 0%, rgb(255 255 255 / .16), transparent 60%)" },
  UNCOMMON: { line: "#f3ecda", lo: 0.92, hi: "#fff", ho: 0.5, sh: "#163010", so: 0.5, dot: "#f6f0dc", dotO: 0.55, extra: "",
    detail: "radial-gradient(circle, rgb(16 42 12 / .22) 0 .7px, transparent 1.1px) 1px 2px / 6px 5px, radial-gradient(120% 70% at 30% 0%, rgb(255 255 255 / .16), transparent 60%)" },
  RARE: { line: "#e3e9f0", lo: 0.92, hi: "#fff", ho: 0.6, sh: "#08162c", so: 0.55, dot: "#e8eef6", dotO: 0.7, extra: "--kn-kanji: #2c5a86;",
    detail: "linear-gradient(90deg, rgb(225 233 242 / .2) 0 1px, transparent 1px) 0 0 / 9cqw 9cqw, linear-gradient(rgb(225 233 242 / .16) 0 1px, transparent 1px) 0 0 / 9cqw 9cqw, radial-gradient(120% 70% at 30% 0%, rgb(255 255 255 / .14), transparent 60%)" },
  EPIC: { line: "#e6c66c", lo: 0.95, hi: "#fff3c4", ho: 0.75, sh: "#1a0b26", so: 0.6, dot: "#f2d88a", dotO: 0.9, extra: "--kn-kanji: #6e4796;",
    detail: "radial-gradient(circle, rgb(240 208 122 / .85) 0 .55px, transparent .95px) 0 0 / 5px 6px, radial-gradient(circle, rgb(240 208 122 / .55) 0 .5px, transparent .9px) 2px 3px / 7px 5px, linear-gradient(180deg, rgb(255 255 255 / .16), transparent 36%)" },
  LEGENDARY: { line: "#6a4c12", lo: 0.82, hi: "#fff6d8", ho: 0.95, sh: "#5a420e", so: 0.35, dot: "#fff3c8", dotO: 0.95, extra: "--kn-edge: #c9a447; --kn-kanji: #8a6a1f;",
    detail: "linear-gradient(90deg, rgb(122 90 22 / .2) 0 1px, transparent 1px) 0 0 / 7.4cqw 7.4cqw, linear-gradient(rgb(122 90 22 / .15) 0 1px, transparent 1px) 3.7cqw 0 / 7.4cqw 7.4cqw, conic-gradient(rgb(255 248 214 / .1) 25%, transparent 0 50%, rgb(255 248 214 / .07) 0 75%, transparent 0) 0 0 / 14.8cqw 14.8cqw, radial-gradient(circle, rgb(255 244 205 / .5) 0 .6px, transparent 1px) 0 0 / 5px 6px" },
  MYTHIC: { line: "#584a7c", lo: 0.66, hi: "#fff", ho: 0.95, sh: "#3b3060", so: 0.22, dot: "#fff", dotO: 0.9, extra: "--kn-edge: #d8cdeb; --kn-kanji: #6f5d9c; --kn-rim: rgb(70 58 105 / .45);",
    detail: "repeating-linear-gradient(62deg, transparent 0 9px, rgb(74 62 110 / .3) 9px 10px), repeating-linear-gradient(-58deg, transparent 0 12px, rgb(74 62 110 / .24) 12px 13px), repeating-linear-gradient(2deg, transparent 0 14px, rgb(74 62 110 / .18) 14px 15px), conic-gradient(from 20deg, rgb(255 228 244 / .55), rgb(200 240 234 / .55), rgb(250 234 200 / .55), rgb(220 206 250 / .55), rgb(255 228 244 / .55)) 0 0 / 19px 17px" },
  AR: { line: "#f3ecdf", lo: 0.92, hi: "#fff", ho: 0.55, sh: "#121a36", so: 0.5, dot: "#f2d88a", dotO: 0.85, extra: `--kn-kanji: #c8372d; --kn-bx: ${AR_CRACK};`,
    detail: "radial-gradient(130% 70% at 50% 0%, rgb(255 255 255 / .2), transparent 60%)" },
  GOLD: { line: "#6e5012", lo: 0.9, hi: "#fffbe6", ho: 1, sh: "#5e430c", so: 0.42, dot: "#fff6d6", dotO: 1, extra: `--kn-seal: #a47a22; --kn-edge: #e2c46e; --kn-kanji: #8a6a1f; --kn-bx-lg: ${SEAMS};`,
    detail: "linear-gradient(90deg, rgb(110 80 18 / .24) 0 1px, transparent 1px) 0 0 / 6.6cqw 6.6cqw, linear-gradient(rgb(110 80 18 / .18) 0 1px, transparent 1px) 3.3cqw 0 / 6.6cqw 6.6cqw, conic-gradient(rgb(255 250 225 / .14) 25%, transparent 0 50%, rgb(255 250 225 / .1) 0 75%, transparent 0) 0 0 / 13.2cqw 13.2cqw, radial-gradient(circle, rgb(255 250 225 / .7) 0 .7px, transparent 1.1px) 0 0 / 6px 5px" },
  // Manga : papier blanc, trame grise, encre noire, liseré rouge
  MR: { line: "#131313", lo: 1, hi: "#fff", ho: 0.9, sh: "#000", so: 0.28, dot: "#6b6b6b", dotO: 0.35,
    extra: `--kn-paper: #f6f1e7; --kn-washi: #f6f1e7; --kn-ink: #1a1714; --kn-muted: #5b544a; --kn-kanji: #131313; --kn-seal: #131313; --kn-rule: #2a2622; --kn-edge: #b3a9a1; --kn-rim: rgb(255 255 255 / .75); --kn-sc-fill: #131313; --kn-sc-line: #f9f4ec; --kn-sc-bg: linear-gradient(150deg, #2b2b2b, #131313 60%, #0a0a0a); --kn-sc-bx: ${crescent("#b3261e")}; --kn-bank-bg: linear-gradient(180deg, #fffdfa, #ece7de 50%, #bdb8b1);`,
    detail: "radial-gradient(circle, rgb(19 19 19 / .3) 0 30%, transparent 34%) 0 0 / 1.25cqw 1.25cqw" },
  // Vitrail : nacre lilas, contours d'or, nuée du sceau violette
  VR: { line: "#b9851f", lo: 1, hi: "#fff6cf", ho: 1, sh: "#6a3fa0", so: 0.3, dot: "#fff1c4", dotO: 0.95,
    extra: `--kn-paper: #faf5f4; --kn-washi: linear-gradient(115deg, transparent 20%, rgb(255 255 255 / .75) 30%, transparent 40%, transparent 60%, rgb(255 255 255 / .6) 68%, transparent 76%), radial-gradient(130% 150% at 50% 0%, #fff8f6, #faf1f2 55%, #f1e3f2); --kn-ink: #241a24; --kn-muted: #6a5a70; --kn-kanji: #6a3fa0; --kn-seal: #4a1f9a; --kn-seal-ring: #f2cf7a; --kn-rule: #8f5fb0; --kn-edge: #d9a93b; --kn-rim: #f2cf7a; --kn-sc-fill: #4a1f9a; --kn-sc-line: #f2cf7a; --kn-sc-bg: radial-gradient(120% 120% at 30% 20%, #8a54e0, #4a1f9a 55%, #2a1670); --kn-sc-bx: ${crescent("#f2cf7a")}; --kn-bank-bg: radial-gradient(55% 110% at 18% 85%, #a97ff0, transparent 72%), radial-gradient(45% 100% at 78% 75%, #7fa4f5, transparent 72%), radial-gradient(38% 85% at 50% 100%, #f29ad6, transparent 72%), radial-gradient(30% 60% at 34% 30%, #fff, transparent 70%), linear-gradient(180deg, #fbf0ff, #e6cdf6);`,
    detail: "linear-gradient(115deg, transparent 38%, rgb(255 255 255 / .55) 46%, transparent 54%), linear-gradient(115deg, transparent 68%, rgb(255 255 255 / .4) 74%, transparent 80%)" },
  XR: { line: "#fff", lo: 0.9, hi: "#fff", ho: 0.5, sh: "#000", so: 0.4, dot: "#fff", dotO: 0.9, extra: "--kn-seal: #141210;",
    detail: "none" },
  // Black : laque noire, contours d'argent, liseré rouge
  BR: { line: "#b9b6b4", lo: 1, hi: "#f0efee", ho: 0.6, sh: "#000", so: 0.7, dot: "#d1cdcc", dotO: 0.2,
    extra: `--kn-paper: #141414; --kn-washi: radial-gradient(130% 150% at 50% 0%, #1f1f1f, #141414 55%, #0c0c0c); --kn-ink: #e8e6e4; --kn-muted: #a9a6a3; --kn-kanji: #d1cdcc; --kn-seal: #0a0a0a; --kn-seal-ring: #b9b6b4; --kn-rule: #8c8988; --kn-edge: #6a6766; --kn-rim: #b9b6b4; --kn-sc-fill: #0e0e0e; --kn-sc-bg: linear-gradient(150deg, #2a2a2a, #0e0e0e 60%, #050505); --kn-sc-bx: ${crescent("#b3261e")}; --kn-bank-bg: linear-gradient(180deg, #3a3a3a, #262626 45%, #111);`,
    detail: "radial-gradient(circle, rgb(255 255 255 / .08) 0 30%, transparent 34%) 0 0 / 1.25cqw 1.25cqw" },
};
const ink = (r) => `--kn-lc: ${r.line}; --kn-lo: ${r.lo}; --kn-hc: ${r.hi}; --kn-ho: ${r.ho}; --kn-shc: ${r.sh}; --kn-sho: ${r.so}; --kn-dc: ${r.dot}; --kn-do: ${r.dotO};`;
const perRarity = Object.entries(RARITIES)
  .map(([k, r]) => `.fuda[data-rarity="${k}"] { ${ink(r)} --kn-detail: ${r.detail}; ${r.extra} }`)
  .join("\n");

const css = `/* Généré par scripts/fuda-face-css.mjs : ne pas éditer à la main.
   Face des fuda « Les Nuées d'or » (Kin'un byōbu 金雲屏風) : l'illustration couvre tout le papier ; un banc
   de nuées peint dans la matière de la rareté (le cadre de app/globals.css) porte le shikishi du nom, une
   nuée porte le sceau et un tanzaku le nom japonais. Niveaux de détail par container queries sur la largeur
   réelle de la carte (54 à 320 px) ; parallaxe 2D par --mx/--my (FudaTilt) sur les cartes vivantes de
   140 px et plus. Hors couche : ces règles passent devant celles du cadre et du papier (@layer components). */
.fuda {
  container: fuda / inline-size;
  --kn-paper: #f5efe2;
  --kn-ink: #1f1b17;
  --kn-muted: #5b544a;
  --kn-rule: var(--fuda-frame);
  --kn-edge: rgb(31 27 23 / .2);
  --kn-seal: var(--fuda-frame);
  ${ink(RARITIES.COMMON)}
}
${perRarity}
.fuda-paper {
  background: #efe6d3;
  box-shadow: 0 0 0 1px rgb(0 0 0 / .34), 0 0 0 calc(1px + .45cqw) rgb(255 255 255 / .1);
}

/* Illustration : tout le papier ; grain de papier en grand format */
.kn-art { position: absolute; inset: 0; overflow: hidden; background: #e4d9c4; }
.kn-grain {
  display: none; position: absolute; inset: 0; pointer-events: none; mix-blend-mode: multiply; opacity: .05;
  background: radial-gradient(circle, #5b4a2e 0 .5px, transparent .9px) 0 0 / 3px 3px, radial-gradient(circle, #5b4a2e 0 .6px, transparent 1px) 1px 2px / 5px 4px, repeating-linear-gradient(94deg, #6d5d43 0 1px, transparent 1px 7px);
}
.kn-lock { position: absolute; inset: 0 0 34cqw; display: grid; place-items: center; font-size: max(18px, 30cqw); line-height: 1; }

/* Banc de nuées : forme en masque, matière de la rareté ; ombre (::before), trait (.kn-ln), poudre d'or (.kn-sn)
   et rehaut (::after) en masques colorés par la rareté */
.kn-bank, .kn-ar { position: absolute; left: 0; bottom: 0; width: 100%; height: 44cqw; pointer-events: none; transform: scaleX(var(--kn-sx, 1)); }
.kn-flip { --kn-sx: -1; }
.kn-bank { ${mask(shape(BANK_VB, `${BANK_TOP}L956 520L0 520Z`))} background: ${layer("--kn-bx")}, ${VOL}, ${BANK_MAT}; }
.kn-bank::before, .kn-bank::after, .kn-sc::before, .kn-sc::after { content: ""; }
.kn-bank::before, .kn-bank::after, .kn-ln, .kn-sn, .kn-sc::before, .kn-sc::after { position: absolute; inset: 0; pointer-events: none; }
.kn-bank::before { display: none; background: var(--kn-shc); opacity: var(--kn-sho); ${mask(shadow(BANK_VB, BANK_TOP))} }
.kn-bank > .kn-ln { background: var(--kn-lc); opacity: var(--kn-lo); ${mask(line(BANK_VB, BANK_TOP, BANK_INNER))} }
.kn-bank::after { background: var(--kn-hc); opacity: var(--kn-ho); ${mask(shine(BANK_VB, BANK_TOP))} }
.kn-sn { display: none; background: var(--kn-dc); opacity: var(--kn-do); ${mask(sunago)} }
.kn-ar { display: none; background: ${AR_LINES} 0 0 / 100% 100% no-repeat; }

/* Nuée du sceau : sous 140 px, trois lobes en dégradés (aucun masque) */
.kn-sc {
  position: absolute; left: -4cqw; top: -4cqw; width: 32cqw; height: 30cqw; pointer-events: none; scale: .86; transform-origin: 0 0;
  background:
    radial-gradient(circle at 24cqw 9cqw, var(--kn-sc-fill, var(--fuda-frame)) calc(5.5cqw - 1px), var(--kn-rim, rgb(31 27 23 / .35)) calc(5.5cqw - 1px) 5.5cqw, transparent calc(5.5cqw + .6px)),
    radial-gradient(circle at 9cqw 23.5cqw, var(--kn-sc-fill, var(--fuda-frame)) calc(5.8cqw - 1px), var(--kn-rim, rgb(31 27 23 / .35)) calc(5.8cqw - 1px) 5.8cqw, transparent calc(5.8cqw + .6px)),
    radial-gradient(circle at 11cqw 11cqw, var(--kn-sc-fill, var(--fuda-frame)) calc(14.5cqw - 1px), var(--kn-rim, rgb(31 27 23 / .35)) calc(14.5cqw - 1px) 14.5cqw, transparent calc(14.5cqw + .6px));
}
.kn-sc::before, .kn-sc::after, .kn-sc > .kn-ln { display: none; }
.kn-seal {
  position: absolute; left: 6.2cqw; top: 6.2cqw; display: grid; place-items: center;
  width: max(16px, 10.5cqw); aspect-ratio: 1; border-radius: max(2px, .7cqw);
  background: linear-gradient(150deg, rgb(255 255 255 / .2), transparent 55%, rgb(0 0 0 / .12)), var(--kn-seal);
  color: #f8f2e4; font-size: max(11px, 7cqw); line-height: 1; text-shadow: 0 1px 0 rgb(0 0 0 / .25);
  box-shadow: 0 0 0 max(1.5px, .7cqw) var(--kn-seal-ring, var(--kn-paper)), 0 1px 2px max(1.5px, .7cqw) rgb(0 0 0 / .32);
}

/* Tanzaku uchigumori (nom japonais), 140 px et plus */
.kn-tz { display: none; }

/* Shikishi de papier collé sur le banc : réserve lisse sous les lettres */
.kn-shk {
  position: absolute; left: 2.6cqw; right: 2.6cqw; bottom: 2.6cqw; height: 15.6cqw;
  display: flex; flex-direction: column; justify-content: center; gap: .9cqw; padding: 0 1.2cqw; text-align: center;
  color: var(--kn-ink); border-radius: 1px; background: ${WASHI};
  box-shadow: inset 0 0 0 max(1.5px, .7cqw) var(--kn-paper), inset 0 0 0 calc(max(1.5px, .7cqw) + max(1px, .28cqw)) var(--kn-rule),
    0 0 0 max(1px, .3cqw) var(--kn-edge), 0 1.2px 2.6px rgb(0 0 0 / .42);
}
.fuda:is([data-rarity="MYTHIC"], [data-rarity="GOLD"]) .kn-shk { background: radial-gradient(circle, rgb(255 255 255 / .9) 0 .5px, transparent .9px) 0 0 / 7px 9px, ${WASHI}; }
.kn-name { margin: 0; font-weight: 800; font-size: max(11px, 10cqw); line-height: 1.08; letter-spacing: -.015em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kn-no {
  position: absolute; right: 4cqw; top: 0; transform: translateY(-94%);
  padding: 0 max(3px, 1.3cqw); border-radius: 1px; white-space: nowrap; background: var(--kn-paper); color: var(--kn-ink);
  font-weight: 500; font-size: max(9.5px, 4.6cqw); line-height: 1.4; font-variant-numeric: tabular-nums; letter-spacing: .02em;
  box-shadow: inset 0 0 0 max(1px, .25cqw) rgb(31 27 23 / .14), 0 1px 2px rgb(0 0 0 / .38);
}
.kn-no:lang(ja) { font-family: ${JP}; font-weight: 700; letter-spacing: .08em; }
.kn-l2 { display: none; }
/* Pastilles des écrans (×2, « Acquise ») : à droite, juste au-dessus du numéro */
.kn-corner { position: absolute; right: 3cqw; bottom: calc(18.2cqw + 15px); display: flex; align-items: center; gap: 4px; }

/* 54 px : silhouette, banc à deux lobes et carré de rareté */
@container fuda (max-width: 79px) {
  .kn-bank { ${mask(svg(BANK_VB, `<path d='${BANK_XS}' fill='#fff'/>`))} background: ${BANK_MAT}; }
  .kn-bank::after, .kn-bank > .kn-ln { display: none; }
  .kn-sc { background: none; }
  .kn-seal { left: 6cqw; top: 6cqw; width: 24cqw; font-size: 0; border-radius: 1px; box-shadow: 0 0 0 1px rgb(255 255 255 / .55); }
  .kn-shk, .kn-corner { display: none; }
}

/* 140 px et plus : nuée du sceau masquée, ombre des contours, tanzaku, deuxième ligne, matières détaillées, parallaxe */
@container fuda (min-width: 140px) {
  .kn-bank { background: ${layer("--kn-bx")}, var(--kn-detail, ${NONE}), ${VOL}, ${BANK_MAT}; }
  .kn-bank::before, .kn-ar, .kn-sc::before, .kn-sc::after, .kn-sc > .kn-ln { display: block; }
  .kn-sc { ${mask(shape(SEAL_VB, `M0 0L${SEAL_EDGE.slice(1)}Z`))} background: ${layer("--kn-sc-bx")}, var(--kn-detail, ${NONE}), ${VOL}, ${SEAL_MAT}; }
  .kn-sc::before { background: var(--kn-shc); opacity: var(--kn-sho); ${mask(shadow(SEAL_VB, SEAL_EDGE))} }
  .kn-sc > .kn-ln { background: var(--kn-sc-line, var(--kn-lc)); opacity: var(--kn-lo); ${mask(line(SEAL_VB, SEAL_EDGE, SEAL_INNER))} }
  .kn-sc::after { background: var(--kn-hc); opacity: var(--kn-ho); ${mask(shine(SEAL_VB, SEAL_EDGE))} }
  .kn-tz {
    position: absolute; right: 2cqw; top: 22cqw; width: max(20px, 11.5cqw); height: 46cqw; overflow: hidden;
    display: flex; flex-direction: row-reverse; justify-content: center; gap: .5cqw; padding: 2.4cqw 0;
    transform: rotate(-2.5deg); color: #1f1b17; font: 600 min(clamp(9.5px, 5.4cqw, 14px), calc(40cqw / var(--kn-tzl, 1))) / 1.04 ${JP};
    background: ${TANZAKU};
    box-shadow: inset 0 0 0 1px rgb(176 138 46 / .5), 1px 2px 3px rgb(0 0 0 / .32);
  }
  .kn-tz b { writing-mode: vertical-rl; font-weight: 600; white-space: nowrap; }
  .kn-tz b + b { margin-top: 1.6em; }
  .kn-shk {
    left: 5cqw; right: 5cqw; height: 20.5cqw; padding: 0 3.6cqw; gap: 1.1cqw;
    background: radial-gradient(38% 80% at 0% 100%, rgb(201 162 74 / .16), transparent 70%), radial-gradient(38% 80% at 100% 0%, rgb(127 163 209 / .14), transparent 70%), ${WASHI};
  }
  .kn-name { font-size: max(12px, 8.4cqw); letter-spacing: 0; }
  .kn-no { right: 3.4cqw; transform: translateY(-64%); }
  .kn-l2 { margin: 0; display: flex; align-items: baseline; justify-content: space-between; gap: 2cqw; font-weight: 500; font-size: max(9.5px, 5.4cqw); line-height: 1.15; color: var(--kn-muted); }
  .kn-sub { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .kn-st { display: flex; gap: 1.8cqw; flex-shrink: 0; color: var(--kn-ink); font-weight: 700; font-variant-numeric: tabular-nums; }
  .kn-st i { font-style: normal; font-size: 1.04em; line-height: 1; margin-right: .18em; color: var(--kn-kanji, var(--kn-ink)); }
  .kn-corner { bottom: calc(23.1cqw + 11px); }
  /* Parallaxe : l'illustration recule derrière le papier (agrandie de 8 % pour ne jamais découvrir ses bords),
     les nuées et les papiers collés avancent */
  .fuda-live :is(.kn-art, .kn-cutout) { translate: calc((var(--mx, .5) - .5) * -5%) calc((var(--my, .5) - .5) * -4%); scale: 1.08; transition: translate 180ms ease-out, scale 180ms ease-out; }
  .fuda-live .kn-bank { ${drift(3, 1.4)} scale: 1.05; }
  .fuda-live .kn-shk { ${drift(3, 1.4)} }
  .fuda-live .kn-tz { ${drift(4.5, 3)} }
  .fuda-live .kn-sc { ${drift(4, 3)} }
  .fuda-live .kn-ar { ${drift(3, 1.6)} }
  .fuda-live .fuda-sheen { will-change: transform; }
}

/* 220 px et plus (fiche, révélation, admin) : double moriage, poudre d'or, coutures de la Gold, grain */
@container fuda (min-width: 220px) {
  .kn-grain, .kn-sn { display: block; }
  .kn-bank { background: ${layer("--kn-bx-lg")}, ${layer("--kn-bx")}, var(--kn-detail, ${NONE}), ${VOL}, ${BANK_MAT}; }
  .kn-bank > .kn-ln { ${mask(line(BANK_VB, BANK_TOP, BANK_INNER, true))} }
  .kn-bank::after { ${mask(shine(BANK_VB, BANK_TOP, true))} }
  .kn-shk { left: 9cqw; right: 9cqw; height: 18.6cqw; bottom: 3.4cqw; padding: 0 3.4cqw; }
  .kn-name { font-size: min(7.4cqw, 22px); }
  .kn-l2 { font-size: min(4.6cqw, 14px); }
  .kn-tz {
    background: radial-gradient(circle, rgb(214 176 84 / .9) 0 .7px, transparent 1.1px) 3px 5px / 9px 14px, repeating-linear-gradient(3deg, rgb(120 100 70 / .05) 0 1px, transparent 1px 5px), ${TANZAKU};
  }
  .kn-corner { bottom: calc(26.1cqw + 3px); }
}
.fuda[data-rarity="GOLD"] .kn-tz {
  background: linear-gradient(90deg, rgb(120 88 20 / .28) 0 1px, transparent 1px) 0 0 / 7px 7px, linear-gradient(rgb(120 88 20 / .22) 0 1px, transparent 1px) 0 0 / 7px 7px, linear-gradient(160deg, #f6e3a1, #d9b556 45%, #f2dc94 70%, #b8902f);
  box-shadow: inset 0 0 0 1px rgb(255 248 220 / .6), 1px 2px 3px rgb(0 0 0 / .32);
}

/* Raretés visuelles : filet autour de l'illustration, plaque et numéro bordés, coins ornés, tanzaku assorti */
.fuda[data-rarity="MR"] .fuda-paper { box-shadow: 0 0 0 1px #131313, 0 0 0 calc(1px + .45cqw) rgb(255 255 255 / .55); }
.fuda[data-rarity="VR"] .fuda-paper { box-shadow: 0 0 0 1px #8f5fb0, 0 0 0 calc(1px + .45cqw) #f2cf7a; }
.fuda[data-rarity="BR"] .fuda-paper { box-shadow: 0 0 0 1px #000, 0 0 0 calc(1px + .45cqw) #8c8988; }
.fuda:is([data-rarity="MR"], [data-rarity="VR"], [data-rarity="BR"]) .kn-no { box-shadow: inset 0 0 0 max(1px, .25cqw) var(--kn-rule), 0 1px 2px rgb(0 0 0 / .38); }
.fuda[data-rarity="BR"] .kn-name { text-shadow: 0 1px 0 rgb(0 0 0 / .8); }
.fuda[data-rarity="MR"] .kn-tz { background: #f9f4ec; color: #1a1714; box-shadow: inset 0 0 0 1px #2a2622, 1px 2px 3px rgb(0 0 0 / .32); }
.fuda[data-rarity="VR"] .kn-tz { background: linear-gradient(160deg, #fff8f6, #f3e6f2 55%, #e6ddf8); color: #241a24; box-shadow: inset 0 0 0 1px #d9a93b, 1px 2px 3px rgb(0 0 0 / .32); }
.fuda[data-rarity="BR"] .kn-tz { background: #141414; color: #e8e6e4; box-shadow: inset 0 0 0 1px #8c8988, 1px 2px 3px rgb(0 0 0 / .5); }
@container fuda (min-width: 140px) {
  .fuda:is([data-rarity="MR"], [data-rarity="VR"], [data-rarity="BR"]) .kn-shk { background: ${corners("3.6cqw", "1.1cqw")}, var(--kn-washi); }
  .fuda:is([data-rarity="MR"], [data-rarity="VR"], [data-rarity="BR"]) .kn-no { background: ${corners("2cqw", ".5cqw")}, var(--kn-paper); }
}

/* Full Art (XR) : l'illustration couvre la carte, un filet de cadre et le nom posé sur un voile d'ombre */
.fuda[data-full-art] { --kn-ink: #fff; --kn-muted: rgb(255 255 255 / .82); --kn-kanji: #fff; }
.fuda[data-full-art] .fuda-paper { inset: 0; border-radius: inherit; box-shadow: none; }
.fuda[data-full-art] .fuda-paper::after { content: ""; position: absolute; inset: 0; border-radius: inherit; padding: max(1.5px, 1.2cqw); background: ${MAT}; pointer-events: none;
  mask: linear-gradient(#000, #000) content-box exclude, linear-gradient(#000, #000); }
.fuda[data-full-art] .kn-bank { mask: none; scale: none; translate: none; background: linear-gradient(transparent 30%, rgb(0 0 0 / .72) 78%, rgb(0 0 0 / .88)); }
.fuda[data-full-art] .kn-bank::before, .fuda[data-full-art] .kn-bank::after, .fuda[data-full-art] .kn-bank > .kn-ln, .fuda[data-full-art] .kn-bank > .kn-sn { display: none; }
.fuda[data-full-art] .kn-shk { background: none; box-shadow: none; text-shadow: 0 1px 3px rgb(0 0 0 / .85); }
.fuda[data-full-art] .kn-no { background: none; box-shadow: none; color: #fff; text-shadow: 0 1px 3px rgb(0 0 0 / .85); }
.fuda[data-full-art] .kn-tz { display: none; }
.fuda[data-full-art] .kn-sc { background: none; mask: none; }
.fuda[data-full-art] .kn-sc::before, .fuda[data-full-art] .kn-sc::after, .fuda[data-full-art] .kn-sc > .kn-ln { display: none; }
/* Personnage détouré : même boîte que l'illustration, il s'efface sous la ligne de stats pour la laisser lisible */
.kn-cutout { position: absolute; inset: 0; z-index: 4; pointer-events: none; mask: linear-gradient(#000 88%, transparent 94%); }

/* Mouvement réduit : FudaTilt ne pose pas .fuda-live ; rien ne se déplace par sécurité */
@media (prefers-reduced-motion: reduce) {
  .fuda-live :is(.kn-art, .kn-cutout, .kn-bank, .kn-shk, .kn-tz, .kn-sc, .kn-ar) { translate: none; }
}
:root[data-motion="reduced"] .fuda-live :is(.kn-art, .kn-cutout, .kn-bank, .kn-shk, .kn-tz, .kn-sc, .kn-ar) { translate: none; }
`;

writeFileSync(new URL("../components/fuda/FudaFace.css", import.meta.url), css);
console.log(`components/fuda/FudaFace.css : ${(css.length / 1024).toFixed(1)} Ko`);
