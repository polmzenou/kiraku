// Effets éphémères du combat : de simples <span> stylés par fx.css, posés dans un calque de la scène
// puis retirés, animés en Web Animations (transform et opacity seulement, aucun filtre animé). Les
// positions viennent de la géométrie des cartes ; la variété vient de suites déterministes (jamais de
// hasard au rendu). Le texte posé ici est décoratif (onomatopées et sceaux en kanji) : le calque est
// masqué aux lecteurs d'écran, qui suivent le fil des actions.

export type Pt = { x: number; y: number };
export type Box = Pt & { w: number; h: number };
export type Art = { src: string; focalX: number; focalY: number };

export type FxRun = {
  /** Calque qui suit la caméra (impacts, techniques). */
  layer: HTMLElement;
  /** Calque plein écran, hors caméra (impact frames, ondes de choc). */
  screen: HTMLElement;
  /** Repère des positions : la scène. */
  world: HTMLElement;
  /** Effets allégés : moitié moins de particules, pas de plein écran. */
  lite: boolean;
  /** Enregistre l'animation pour la vitesse, le passage accéléré et l'arrêt. */
  track: (a: Animation) => Animation;
};

const OUT = "cubic-bezier(.16,.84,.3,1)";
const SNAP = "cubic-bezier(.2,.9,.25,1.05)";
const IN = "cubic-bezier(.55,0,.85,.35)";

/** Suite pseudo-aléatoire déterministe dans [0, 1[. */
export const noise = (i: number, salt = 1) => {
  const v = Math.sin(i * 127.1 + salt * 311.7) * 43_758.5453;
  return v - Math.floor(v);
};

export function boxOf(node: Element, world: Element): Box {
  const r = node.getBoundingClientRect();
  const w = world.getBoundingClientRect();
  return { x: r.left - w.left + r.width / 2, y: r.top - w.top + r.height / 2, w: r.width, h: r.height };
}

function node(parent: HTMLElement, cls: string, text?: string): HTMLSpanElement {
  const s = document.createElement("span");
  s.className = `vfx ${cls}`;
  if (text) s.textContent = text;
  parent.appendChild(s);
  return s;
}

function size<T extends HTMLElement>(s: T, w: number, h = w): T {
  s.style.width = `${w}px`;
  s.style.height = `${h}px`;
  return s;
}

/** Translation qui centre une boîte w × h sur un point. */
const on = (p: Pt, w: number, h = w) => `translate(${p.x - w / 2}px, ${p.y - h / 2}px)`;

function play(run: FxRun, el: Element, frames: Keyframe[], opts: KeyframeAnimationOptions, remove = true): Animation {
  const a = run.track(el.animate(frames, { fill: "both", easing: OUT, ...opts }));
  if (remove) a.finished.then(() => el.remove(), () => el.remove());
  return a;
}

const n = (run: FxRun, full: number) => (run.lite ? Math.max(2, Math.round(full / 2)) : full);
const angle = (a: Pt, b: Pt) => Math.atan2(b.y - a.y, b.x - a.x);
const deg = (rad: number) => (rad * 180) / Math.PI;

// ---------- Impacts ----------

/** Impact sur une carte : éclats d'encre, onde, étincelles dans l'axe du coup. */
export function impact(run: FxRun, to: Box, from: Pt | null, power: 1 | 2 | 3, crit: boolean) {
  const dir = from ? angle(from, to) : -Math.PI / 2;
  const s = to.w * (0.95 + power * 0.32);
  const ink = size(node(run.layer, crit ? "vfx-ink vfx-ink-kin" : "vfx-ink"), s);
  const turn = deg(dir) + 90;
  play(run, ink, [
    { transform: `${on(to, s)} rotate(${turn}deg) scale(.25)`, opacity: 1 },
    { transform: `${on(to, s)} rotate(${turn + 6}deg) scale(1.08)`, opacity: 1, offset: 0.18 },
    { transform: `${on(to, s)} rotate(${turn + 10}deg) scale(1.22)`, opacity: 0 },
  ], { duration: 560 });

  const ring = size(node(run.layer, crit ? "vfx-ring vfx-ring-kin" : "vfx-ring"), to.w * 1.1);
  play(run, ring, [
    { transform: `${on(to, to.w * 1.1)} scale(.2)`, opacity: 0.95 },
    { transform: `${on(to, to.w * 1.1)} scale(${1.4 + power * 0.25})`, opacity: 0 },
  ], { duration: 460 });

  const count = n(run, 6 + power * 2);
  for (let i = 0; i < count; i++) {
    const spread = (noise(i, 3) - 0.5) * (from ? 1.6 : Math.PI * 2);
    const a = dir + spread;
    const dist = to.w * (0.55 + noise(i, 7) * 0.7) * (0.8 + power * 0.2);
    const p = node(run.layer, crit ? "vfx-spark vfx-spark-kin" : "vfx-spark");
    const r = deg(a) + 90;
    play(run, p, [
      { transform: `translate(${to.x}px, ${to.y}px) rotate(${r}deg) scaleY(.4)`, opacity: 1 },
      { transform: `translate(${to.x + Math.cos(a) * dist}px, ${to.y + Math.sin(a) * dist}px) rotate(${r}deg) scaleY(1)`, opacity: 0 },
    ], { duration: 300 + noise(i, 5) * 160 });
  }
}

/** Éclair blanc sur la carte (calque déjà posé dans la carte). */
export function cardFlash(run: FxRun, flash: HTMLElement | null, power: number) {
  if (!flash) return;
  play(run, flash, [{ opacity: 0 }, { opacity: 0.55 + power * 0.12, offset: 0.12 }, { opacity: 0 }], { duration: 220 + power * 40, easing: "ease-out" }, false);
}

/** Fissures qui apparaissent puis s'effacent sur un coup lourd. */
export function cardCrack(run: FxRun, crack: HTMLElement | null) {
  if (!crack) return;
  play(run, crack, [{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 1_300, easing: "linear" }, false);
}

/** Traînées derrière une carte qui fonce (images rémanentes). */
export function streaks(run: FxRun, from: Box, to: Pt) {
  const a = angle(from, to);
  for (let i = 0; i < n(run, 5); i++) {
    const s = node(run.layer, "vfx-streak");
    const off = (i - 2) * from.w * 0.16;
    const x = from.x - Math.sin(a) * off;
    const y = from.y + Math.cos(a) * off;
    s.style.width = `${from.h * 0.9}px`;
    play(run, s, [
      { transform: `translate(${x - from.h * 0.45}px, ${y}px) rotate(${deg(a)}deg) scaleX(.2)`, opacity: 0 },
      { transform: `translate(${x - from.h * 0.45}px, ${y}px) rotate(${deg(a)}deg) scaleX(1)`, opacity: 0.85, offset: 0.35 },
      { transform: `translate(${x - from.h * 0.45 + Math.cos(a) * from.h * 0.6}px, ${y + Math.sin(a) * from.h * 0.6}px) rotate(${deg(a)}deg) scaleX(.6)`, opacity: 0 },
    ], { duration: 260, delay: i * 18 });
  }
}

/** Anneau de poussière quand une carte se pose. */
export function dust(run: FxRun, at: Box) {
  const y = at.y + at.h * 0.46;
  for (let i = 0; i < n(run, 8); i++) {
    const side = i % 2 ? 1 : -1;
    const p = size(node(run.layer, "vfx-dust"), at.w * (0.16 + noise(i, 2) * 0.1));
    const dx = side * at.w * (0.35 + noise(i, 4) * 0.4);
    play(run, p, [
      { transform: `translate(${at.x - at.w * 0.08}px, ${y}px) scale(.4)`, opacity: 0.7 },
      { transform: `translate(${at.x + dx}px, ${y - at.h * (0.05 + noise(i, 6) * 0.1)}px) scale(1.4)`, opacity: 0 },
    ], { duration: 620 + noise(i, 8) * 200 });
  }
}

/** Onde de choc plein écran (critiques, coups de grâce, sceau 対). */
export function shock(run: FxRun, at: Pt, radius: number, tone: "washi" | "kin" | "shu" = "washi") {
  if (run.lite) return;
  const s = size(node(run.screen, `vfx-shock vfx-shock-${tone}`), radius * 2);
  play(run, s, [
    { transform: `${on(at, radius * 2)} scale(.1)`, opacity: 0.9 },
    { transform: `${on(at, radius * 2)} scale(1)`, opacity: 0 },
  ], { duration: 640 });
}

// ---------- Techniques ----------

/** 一閃 : une entaille de lumière traverse l'écran en passant par la cible. */
export function slash(run: FxRun, to: Box, tilt = -24, delay = 0) {
  const w = run.world.clientWidth * 1.5;
  const s = node(run.screen, "vfx-slash");
  s.style.width = `${w}px`;
  const base = `translate(${to.x - w / 2}px, ${to.y}px) rotate(${tilt}deg)`;
  play(run, s, [
    { transform: `${base} scaleX(0) scaleY(1)`, opacity: 1, transformOrigin: "0 50%" },
    { transform: `${base} scaleX(1) scaleY(1)`, opacity: 1, offset: 0.25, transformOrigin: "0 50%" },
    { transform: `${base} scaleX(1) scaleY(.1)`, opacity: 0, transformOrigin: "0 50%" },
  ], { duration: 360, delay, easing: SNAP });
  const red = node(run.screen, "vfx-slash vfx-slash-shu");
  red.style.width = `${w}px`;
  play(run, red, [
    { transform: `translate(${to.x - w / 2}px, ${to.y + 6}px) rotate(${tilt}deg) scaleX(0)`, opacity: 0.9, transformOrigin: "0 50%" },
    { transform: `translate(${to.x - w / 2}px, ${to.y + 6}px) rotate(${tilt}deg) scaleX(1)`, opacity: 0.9, offset: 0.3, transformOrigin: "0 50%" },
    { transform: `translate(${to.x - w / 2}px, ${to.y + 6}px) rotate(${tilt}deg) scaleX(1) scaleY(.1)`, opacity: 0, transformOrigin: "0 50%" },
  ], { duration: 420, delay: delay + 40, easing: SNAP });
}

/** 貫通 : un trait perce la cible de part en part, sa garde vole en éclats. */
export function pierce(run: FxRun, from: Box, to: Box) {
  const a = angle(from, to);
  const len = Math.hypot(to.x - from.x, to.y - from.y) * 1.6;
  const beam = node(run.layer, "vfx-beam");
  beam.style.width = `${len}px`;
  const base = `translate(${from.x}px, ${from.y}px) rotate(${deg(a)}deg)`;
  play(run, beam, [
    { transform: `${base} scaleX(0)`, opacity: 1, transformOrigin: "0 50%" },
    { transform: `${base} scaleX(1)`, opacity: 1, offset: 0.35, transformOrigin: "0 50%" },
    { transform: `${base} scaleX(1) scaleY(.15)`, opacity: 0, transformOrigin: "0 50%" },
  ], { duration: 420, easing: SNAP });
  shards(run, to, a, "vfx-shard", 9);
}

/** Éclats de garde ou de bouclier projetés dans l'axe du coup. */
function shards(run: FxRun, at: Box, dir: number, cls: string, count: number) {
  for (let i = 0; i < n(run, count); i++) {
    const a = dir + (noise(i, 11) - 0.5) * 1.8;
    const d = at.w * (0.6 + noise(i, 13) * 0.9);
    const s = size(node(run.layer, cls), at.w * (0.14 + noise(i, 17) * 0.12));
    const r0 = noise(i, 19) * 360;
    play(run, s, [
      { transform: `${on(at, 0)} rotate(${r0}deg) scale(.6)`, opacity: 1 },
      { transform: `translate(${at.x + Math.cos(a) * d}px, ${at.y + Math.sin(a) * d + at.h * 0.2}px) rotate(${r0 + 260}deg) scale(1)`, opacity: 0 },
    ], { duration: 620 + noise(i, 23) * 260, easing: "cubic-bezier(.12,.7,.35,1)" });
  }
}

/** 乱舞 : tempête de pétales et de lames sur la rangée ennemie. */
export function bladeStorm(run: FxRun, targets: readonly Box[]) {
  if (!targets.length) return;
  const left = Math.min(...targets.map((t) => t.x - t.w)) - 40;
  const right = Math.max(...targets.map((t) => t.x + t.w)) + 40;
  const y = targets.reduce((s, t) => s + t.y, 0) / targets.length;
  const h = targets[0].h;
  for (let i = 0; i < n(run, 26); i++) {
    const p = size(node(run.layer, i % 3 ? "vfx-petal" : "vfx-petal vfx-petal-shu"), 10 + noise(i, 3) * 9, 7 + noise(i, 5) * 5);
    const y0 = y + (noise(i, 7) - 0.5) * h * 1.3;
    const y1 = y0 + (noise(i, 9) - 0.5) * h * 0.6;
    play(run, p, [
      { transform: `translate(${left}px, ${y0}px) rotate(${noise(i, 2) * 180}deg)`, opacity: 0 },
      { transform: `translate(${left + (right - left) * 0.45}px, ${(y0 + y1) / 2 - h * 0.15}px) rotate(${noise(i, 2) * 180 + 260}deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${right}px, ${y1}px) rotate(${noise(i, 2) * 180 + 520}deg)`, opacity: 0 },
    ], { duration: 820 + noise(i, 4) * 360, delay: noise(i, 6) * 260, easing: "cubic-bezier(.3,.1,.4,1)" });
  }
  targets.forEach((t, i) => slash(run, t, i % 2 ? 28 : -22, 60 + i * 170));
}

/** 癒し : colonne de lumière et pétales qui montent. */
export function healColumn(run: FxRun, at: Box) {
  const c = size(node(run.layer, "vfx-column"), at.w * 1.3, at.h * 2.2);
  play(run, c, [
    { transform: `${on({ x: at.x, y: at.y - at.h * 0.3 }, at.w * 1.3, at.h * 2.2)} scaleY(0)`, opacity: 0, transformOrigin: "50% 100%" },
    { transform: `${on({ x: at.x, y: at.y - at.h * 0.3 }, at.w * 1.3, at.h * 2.2)} scaleY(1)`, opacity: 0.9, offset: 0.3, transformOrigin: "50% 100%" },
    { transform: `${on({ x: at.x, y: at.y - at.h * 0.3 }, at.w * 1.3, at.h * 2.2)} scaleY(1) scaleX(.6)`, opacity: 0, transformOrigin: "50% 100%" },
  ], { duration: 900 });
  for (let i = 0; i < n(run, 14); i++) {
    const p = size(node(run.layer, i % 2 ? "vfx-petal" : "vfx-petal vfx-petal-jade"), 9 + noise(i, 3) * 6, 6 + noise(i, 5) * 4);
    const x = at.x + (noise(i, 7) - 0.5) * at.w;
    play(run, p, [
      { transform: `translate(${x}px, ${at.y + at.h * 0.45}px) rotate(0deg)`, opacity: 0 },
      { transform: `translate(${x + (noise(i, 9) - 0.5) * 30}px, ${at.y - at.h * 0.2}px) rotate(160deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${x + (noise(i, 9) - 0.5) * 50}px, ${at.y - at.h * 0.85}px) rotate(320deg)`, opacity: 0 },
    ], { duration: 1_000 + noise(i, 4) * 300, delay: noise(i, 6) * 260 });
  }
}

/** 守護 : des ofuda tournent autour de l'allié puis se referment en kekkai. */
export function kekkai(run: FxRun, at: Box) {
  const r = at.w * 0.75;
  const count = n(run, 6);
  for (let i = 0; i < count; i++) {
    const o = size(node(run.layer, "vfx-ofuda vfx-ofuda-ai"), at.w * 0.16, at.w * 0.38);
    const frames: Keyframe[] = [];
    for (let k = 0; k <= 6; k++) {
      const a = ((i / count) + k * 0.12) * Math.PI * 2;
      const rr = r * (1 - (k / 6) * 0.55);
      frames.push({ transform: `translate(${at.x + Math.cos(a) * rr - at.w * 0.08}px, ${at.y + Math.sin(a) * rr * 0.55 - at.w * 0.19}px) rotate(${deg(a) + 90}deg)`, opacity: k === 6 ? 0 : 1 });
    }
    play(run, o, frames, { duration: 560, easing: "linear" });
  }
  const hex = size(node(run.layer, "vfx-hex"), at.w * 1.25, at.h * 1.15);
  play(run, hex, [
    { transform: `${on(at, at.w * 1.25, at.h * 1.15)} scale(.6)`, opacity: 0 },
    { transform: `${on(at, at.w * 1.25, at.h * 1.15)} scale(1.02)`, opacity: 1, offset: 0.55 },
    { transform: `${on(at, at.w * 1.25, at.h * 1.15)} scale(1.1)`, opacity: 0 },
  ], { duration: 900, delay: 420 });
}

/** 鼓舞 : flammes d'or sur chaque allié. */
export function flames(run: FxRun, at: Box, delay = 0) {
  for (let i = 0; i < n(run, 7); i++) {
    const f = size(node(run.layer, i % 3 ? "vfx-flame" : "vfx-flame vfx-flame-shu"), at.w * (0.22 + noise(i, 3) * 0.14), at.w * (0.42 + noise(i, 5) * 0.3));
    const x = at.x + (i / 6 - 0.5) * at.w * 0.95;
    const y = at.y + at.h * 0.42;
    play(run, f, [
      { transform: `translate(${x - at.w * 0.12}px, ${y}px) scale(.3, .2)`, opacity: 0, transformOrigin: "50% 100%" },
      { transform: `translate(${x - at.w * 0.12}px, ${y - at.h * 0.35}px) scale(1, 1.1)`, opacity: 1, offset: 0.4, transformOrigin: "50% 100%" },
      { transform: `translate(${x - at.w * 0.12}px, ${y - at.h * 0.75}px) scale(.5, 1.3)`, opacity: 0, transformOrigin: "50% 100%" },
    ], { duration: 820, delay: delay + noise(i, 7) * 200 });
  }
}

/** 封印 : l'ofuda vole en arc jusqu'à la cible et s'y plaque. */
export function ofudaThrow(run: FxRun, from: Box, to: Box, ms: number) {
  const w = to.w * 0.32;
  const h = to.w * 0.78;
  const o = size(node(run.layer, "vfx-ofuda"), w, h);
  const mid = { x: (from.x + to.x) / 2 + (to.x > from.x ? -40 : 40), y: Math.min(from.y, to.y) - from.h * 0.6 };
  play(run, o, [
    { transform: `${on(from, w, h)} rotate(-30deg) scale(.6)`, opacity: 0 },
    { transform: `${on(mid, w, h)} rotate(200deg) scale(1)`, opacity: 1, offset: 0.55 },
    { transform: `${on(to, w, h)} rotate(352deg) scale(1.25)`, opacity: 1, offset: 0.92, easing: IN },
    { transform: `${on(to, w, h)} rotate(360deg) scale(1)`, opacity: 0 },
  ], { duration: ms + 120 });
  const ring = size(node(run.layer, "vfx-ring vfx-ring-shu"), to.w);
  play(run, ring, [
    { transform: `${on(to, to.w)} scale(.3)`, opacity: 0 },
    { transform: `${on(to, to.w)} scale(.3)`, opacity: 0.9, offset: 0.01 },
    { transform: `${on(to, to.w)} scale(1.6)`, opacity: 0 },
  ], { duration: 460, delay: ms - 20 });
}

// ---------- Passifs et états ----------

/** Sceau tamponné sur une carte, avec le mot traduit (K.-O., critique, renaissance, scellée). */
export function stamp(run: FxRun, at: Box, text: string, tone: "shu" | "kin" | "ai" = "shu", hold = 900) {
  const p = node(run.layer, `vfx-stamp vfx-stamp-${tone}`, text);
  p.style.fontSize = `${Math.max(12, at.w * 0.14)}px`;
  // Le mot déborde souvent de la carte : centré sur elle par son propre translate(-50 %, -50 %), mais
  // gardé dans le cadre pour les cartes des bords
  const half = p.offsetWidth / 2 + 8;
  const x = Math.max(half, Math.min(at.x, run.world.clientWidth - half));
  const c = `translate(${x}px, ${at.y}px) translate(-50%, -50%)`;
  play(run, p, [
    { transform: `${c} scale(2.3) rotate(-30deg)`, opacity: 0, easing: IN },
    { transform: `${c} scale(.9) rotate(-10deg)`, opacity: 1, offset: 0.2, easing: SNAP },
    { transform: `${c} scale(1) rotate(-12deg)`, opacity: 1, offset: 0.3 },
    { transform: `${c} scale(1) rotate(-12deg)`, opacity: 1, offset: 0.85 },
    { transform: `${c} scale(1.05) rotate(-12deg)`, opacity: 0 },
  ], { duration: 380 + hold });
}

/** 結界 : le coup se brise sur un bouclier d'hexagones. */
export function shieldBreak(run: FxRun, at: Box, from: Pt | null) {
  const hex = size(node(run.layer, "vfx-hex"), at.w * 1.2, at.h * 1.1);
  play(run, hex, [
    { transform: `${on(at, at.w * 1.2, at.h * 1.1)} scale(1)`, opacity: 1 },
    { transform: `${on(at, at.w * 1.2, at.h * 1.1)} scale(1.08)`, opacity: 0 },
  ], { duration: 360 });
  shards(run, at, from ? angle(from, at) : -Math.PI / 2, "vfx-shard vfx-shard-ai", 10);
}

/** 毒 : encre violette qui monte dans la carte. */
export function poisonSeep(run: FxRun, at: Box) {
  const p = size(node(run.layer, "vfx-venom"), at.w * 1.05, at.h);
  play(run, p, [
    { transform: `${on({ x: at.x, y: at.y + at.h * 0.35 }, at.w * 1.05, at.h)} scaleY(.2)`, opacity: 0, transformOrigin: "50% 100%" },
    { transform: `${on({ x: at.x, y: at.y + at.h * 0.1 }, at.w * 1.05, at.h)} scaleY(1)`, opacity: 0.85, offset: 0.4, transformOrigin: "50% 100%" },
    { transform: `${on({ x: at.x, y: at.y }, at.w * 1.05, at.h)} scaleY(1)`, opacity: 0, transformOrigin: "50% 100%" },
  ], { duration: 900 });
  bubbles(run, at);
}

/** Bulles de poison qui montent et éclatent. */
export function bubbles(run: FxRun, at: Box) {
  for (let i = 0; i < n(run, 8); i++) {
    const s = 6 + noise(i, 3) * 9;
    const b = size(node(run.layer, "vfx-bubble"), s);
    const x = at.x + (noise(i, 5) - 0.5) * at.w * 0.8;
    play(run, b, [
      { transform: `translate(${x}px, ${at.y + at.h * 0.4}px) scale(.3)`, opacity: 0 },
      { transform: `translate(${x + (noise(i, 7) - 0.5) * 12}px, ${at.y - at.h * (0.05 + noise(i, 9) * 0.3)}px) scale(1)`, opacity: 1, offset: 0.8 },
      { transform: `translate(${x}px, ${at.y - at.h * (0.1 + noise(i, 9) * 0.3)}px) scale(1.6)`, opacity: 0 },
    ], { duration: 700 + noise(i, 2) * 400, delay: noise(i, 4) * 300 });
  }
}

/** 反撃 : reflet de lame sur la carte qui renvoie le coup. */
export function glint(run: FxRun, at: Box) {
  const s = at.w * 0.7;
  const g = size(node(run.layer, "vfx-glint"), s);
  const p = { x: at.x + at.w * 0.28, y: at.y - at.h * 0.32 };
  play(run, g, [
    { transform: `${on(p, s)} scale(0) rotate(0deg)`, opacity: 0 },
    { transform: `${on(p, s)} scale(1) rotate(45deg)`, opacity: 1, offset: 0.4 },
    { transform: `${on(p, s)} scale(.2) rotate(90deg)`, opacity: 0 },
  ], { duration: 380, easing: SNAP });
}

/** 遺言 : un feu follet va de la carte tombée à l'allié qu'il soigne. */
export function wisp(run: FxRun, from: Box, to: Box, ms: number) {
  const s = from.w * 0.34;
  const w = size(node(run.layer, "vfx-wisp"), s);
  const mid = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - from.h * 0.55 };
  play(run, w, [
    { transform: `${on(from, s)} scale(.4)`, opacity: 0 },
    { transform: `${on(mid, s)} scale(1)`, opacity: 1, offset: 0.5 },
    { transform: `${on(to, s)} scale(.7)`, opacity: 1, offset: 0.92 },
    { transform: `${on(to, s)} scale(1.6)`, opacity: 0 },
  ], { duration: ms, easing: "cubic-bezier(.45,.05,.4,1)" });
}

/** K.-O. : cendres qui montent et voile d'encre. */
export function ash(run: FxRun, at: Box) {
  const puff = size(node(run.layer, "vfx-smoke"), at.w * 1.5);
  play(run, puff, [
    { transform: `${on(at, at.w * 1.5)} scale(.5)`, opacity: 0.8 },
    { transform: `${on({ x: at.x, y: at.y - at.h * 0.3 }, at.w * 1.5)} scale(1.4)`, opacity: 0 },
  ], { duration: 1_100 });
  for (let i = 0; i < n(run, 16); i++) {
    const s = size(node(run.layer, i % 4 ? "vfx-ash" : "vfx-ash vfx-ember"), 3 + noise(i, 3) * 4);
    const x = at.x + (noise(i, 5) - 0.5) * at.w;
    const y = at.y + (noise(i, 7) - 0.3) * at.h * 0.6;
    play(run, s, [
      { transform: `translate(${x}px, ${y}px)`, opacity: 0 },
      { transform: `translate(${x + (noise(i, 9) - 0.5) * 20}px, ${y - at.h * 0.25}px)`, opacity: 1, offset: 0.3 },
      { transform: `translate(${x + (noise(i, 9) - 0.5) * 60}px, ${y - at.h * (0.7 + noise(i, 2) * 0.5)}px)`, opacity: 0 },
    ], { duration: 1_300 + noise(i, 4) * 700, delay: noise(i, 6) * 300, easing: "cubic-bezier(.3,.3,.5,1)" });
  }
}

/** 復活 : les cendres se rassemblent dans une colonne de lumière, puis le sceau du passif (`label`, traduit). */
export function revive(run: FxRun, at: Box, label: string) {
  for (let i = 0; i < n(run, 16); i++) {
    const s = size(node(run.layer, "vfx-ash vfx-ember"), 3 + noise(i, 3) * 4);
    const a = noise(i, 5) * Math.PI * 2;
    const d = at.w * (0.7 + noise(i, 7) * 0.7);
    play(run, s, [
      { transform: `translate(${at.x + Math.cos(a) * d}px, ${at.y + Math.sin(a) * d}px)`, opacity: 0 },
      { transform: `translate(${at.x + Math.cos(a) * d * 0.5}px, ${at.y + Math.sin(a) * d * 0.5}px)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${at.x}px, ${at.y}px)`, opacity: 0 },
    ], { duration: 560, delay: noise(i, 9) * 160, easing: IN });
  }
  const c = size(node(run.layer, "vfx-column vfx-column-kin"), at.w * 1.3, at.h * 2.2);
  const pos = on({ x: at.x, y: at.y - at.h * 0.3 }, at.w * 1.3, at.h * 2.2);
  play(run, c, [
    { transform: `${pos} scaleY(0)`, opacity: 0, transformOrigin: "50% 100%" },
    { transform: `${pos} scaleY(1)`, opacity: 1, offset: 0.4, transformOrigin: "50% 100%" },
    { transform: `${pos} scaleY(1) scaleX(.5)`, opacity: 0, transformOrigin: "50% 100%" },
  ], { duration: 900, delay: 480 });
  stamp(run, at, label, "kin", 700);
}

/** 挑発 : ondes rouges autour de la carte qui attire les coups. */
export function taunt(run: FxRun, at: Box) {
  for (let k = 0; k < 2; k++) {
    const r = size(node(run.layer, "vfx-ring vfx-ring-shu vfx-ring-thick"), at.w * 1.1, at.h * 1.05);
    play(run, r, [
      { transform: `${on(at, at.w * 1.1, at.h * 1.05)} scale(.9)`, opacity: 0.9 },
      { transform: `${on(at, at.w * 1.1, at.h * 1.05)} scale(1.35)`, opacity: 0 },
    ], { duration: 640, delay: k * 220 });
  }
}

/** 疾風 : tourbillon de vent autour de la carte qui rejoue. */
export function flurry(run: FxRun, at: Box) {
  for (let k = 0; k < n(run, 3); k++) {
    const s = at.w * (1.05 + k * 0.2);
    const r = size(node(run.layer, "vfx-swirl"), s, s * 0.5);
    play(run, r, [
      { transform: `${on({ x: at.x, y: at.y + at.h * (0.3 - k * 0.22) }, s, s * 0.5)} rotate(${k * 40}deg) scale(.6)`, opacity: 0 },
      { transform: `${on({ x: at.x, y: at.y + at.h * (0.3 - k * 0.22) }, s, s * 0.5)} rotate(${k * 40 + 220}deg) scale(1)`, opacity: 0.9, offset: 0.5 },
      { transform: `${on({ x: at.x, y: at.y + at.h * (0.3 - k * 0.22) - 20 }, s, s * 0.5)} rotate(${k * 40 + 420}deg) scale(1.1)`, opacity: 0 },
    ], { duration: 640, delay: k * 70 });
  }
}

/** Une orbe 気 vole de la bannière jusqu'à la carte qui lance sa technique. */
export function orbFly(run: FxRun, from: Pt, to: Box, i: number) {
  const s = 18;
  const o = size(node(run.layer, "vfx-orb"), s);
  const mid = { x: (from.x + to.x) / 2 + (i - 1) * 18, y: (from.y + to.y) / 2 - 40 };
  play(run, o, [
    { transform: `${on(from, s)} scale(1)`, opacity: 1 },
    { transform: `${on(mid, s)} scale(1.3)`, opacity: 1, offset: 0.5 },
    { transform: `${on(to, s)} scale(.4)`, opacity: 0 },
  ], { duration: 520, delay: i * 70, easing: "cubic-bezier(.5,0,.3,1)" });
}

// ---------- Impact frames ----------

/** Sumi (gekiga) : quelques images en négatif, lignes de vitesse vers la cible, onomatopée au pinceau. */
export function frameSumi(run: FxRun, to: Box, finisher: boolean, ms: number) {
  const W = run.world.clientWidth;
  const H = run.world.clientHeight;
  const white = node(run.screen, "vfx-full vfx-frame-white");
  play(run, white, [{ opacity: 0 }, { opacity: 1, offset: 0.01 }, { opacity: 1, offset: 0.12 }, { opacity: 0, offset: 0.2 }, { opacity: 0 }], { duration: ms, easing: "steps(1, end)" });
  const neg = node(run.screen, "vfx-full vfx-frame-negative");
  play(run, neg, [{ opacity: 0 }, { opacity: 0, offset: 0.16 }, { opacity: 1, offset: 0.17 }, { opacity: 1, offset: 0.6 }, { opacity: 0, offset: 0.61 }, { opacity: 0 }], { duration: ms, easing: "linear" });
  const lines = node(run.screen, "vfx-full vfx-frame-lines");
  lines.style.setProperty("--x", `${(to.x / W) * 100}%`);
  lines.style.setProperty("--y", `${(to.y / H) * 100}%`);
  play(run, lines, [
    { opacity: 0, transform: "scale(1.08)" },
    { opacity: 0, transform: "scale(1.08)", offset: 0.16 },
    { opacity: 1, transform: "scale(1.04)", offset: 0.17 },
    { opacity: 1, transform: "scale(1)", offset: 0.62 },
    { opacity: 0, transform: "scale(1)" },
  ], { duration: ms, easing: "linear" });
  const sfx = node(run.screen, "vfx-sfx", finisher ? "ドゴォ" : "ドン");
  const p = { x: Math.min(Math.max(to.x, W * 0.3), W * 0.7), y: to.y - to.h * 0.9 };
  play(run, sfx, [
    { transform: `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) rotate(-9deg) scale(.4)`, opacity: 0 },
    { transform: `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) rotate(-9deg) scale(1.15)`, opacity: 1, offset: 0.22 },
    { transform: `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) rotate(-7deg) scale(1)`, opacity: 1, offset: 0.7 },
    { transform: `translate(${p.x}px, ${p.y - 10}px) translate(-50%, -50%) rotate(-7deg) scale(1.05)`, opacity: 0 },
  ], { duration: ms + 380 });
  shock(run, to, Math.max(W, H) * 0.7, finisher ? "shu" : "washi");
}

/** Koma : trois cases de manga obliques (le regard, le coup, la cible), puis elles volent en éclats. */
export function frameKoma(run: FxRun, to: Box, artFrom: Art, artTo: Art, finisher: boolean, ms: number) {
  const page = node(run.screen, "vfx-full vfx-koma");
  const panels: [string, Art | null, string][] = [
    ["vfx-koma-1", artFrom, "translate(-110%, -20%)"],
    ["vfx-koma-2", null, "translate(0, -120%)"],
    ["vfx-koma-3", artTo, "translate(110%, 20%)"],
  ];
  const hold = ms - 260;
  panels.forEach(([cls, art, enter], i) => {
    const panel = document.createElement("span");
    panel.className = `vfx-koma-panel ${cls}`;
    if (art) {
      const img = document.createElement("img");
      img.src = art.src;
      img.alt = "";
      img.draggable = false;
      img.style.objectPosition = `${art.focalX}% ${art.focalY}%`;
      panel.appendChild(img);
      const tone = document.createElement("span");
      tone.className = i === 2 ? "vfx-koma-tone vfx-koma-hurt" : "vfx-koma-tone";
      panel.appendChild(tone);
    } else {
      const sfx = document.createElement("span");
      sfx.className = "vfx-koma-sfx";
      sfx.textContent = finisher ? "ドゴォ" : "ドン";
      panel.appendChild(sfx);
    }
    page.appendChild(panel);
    const out = ["translate(-40%, -60%) rotate(-14deg)", "translate(10%, 90%) rotate(9deg)", "translate(60%, 40%) rotate(16deg)"][i];
    // Les cases claquent tout de suite (la page blanche ne doit jamais se voir seule), tiennent, puis s'envolent
    play(run, panel, [
      { transform: `${enter}`, opacity: 0, easing: SNAP },
      { transform: "translate(0, 0)", opacity: 1, offset: 0.05 + i * 0.035 },
      { transform: "translate(0, 0) scale(1.02)", opacity: 1, offset: hold / ms, easing: IN },
      { transform: `${out} scale(.9)`, opacity: 0 },
    ], { duration: ms, easing: "linear" }, false);
  });
  play(run, page, [{ opacity: 0 }, { opacity: 1, offset: 0.04 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }], { duration: ms, easing: "linear" });
  shock(run, to, run.world.clientWidth * 0.6, "kin");
}

/** Mie (kabuki) : projecteur sur l'attaquant, traits kumadori vermillon, sceau du coup (`label`, traduit). */
export function frameMie(run: FxRun, from: Box, to: Box, finisher: boolean, ms: number, label: string) {
  const W = run.world.clientWidth;
  const H = run.world.clientHeight;
  const dark = node(run.screen, "vfx-full vfx-mie-dark");
  dark.style.setProperty("--x", `${(from.x / W) * 100}%`);
  dark.style.setProperty("--y", `${(from.y / H) * 100}%`);
  dark.style.setProperty("--r", `${Math.max(from.w, from.h) * 0.75}px`);
  play(run, dark, [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: ms, easing: "ease-out" });
  const strokes = [
    { y: 0.3, r: -12, d: 120 },
    { y: 0.52, r: 8, d: 220 },
    { y: 0.72, r: -6, d: 320 },
  ];
  strokes.forEach((s, i) => {
    if (run.lite && i === 2) return;
    const k = node(run.screen, "vfx-kumadori");
    k.style.width = `${W * 1.2}px`;
    const base = `translate(${-W * 0.1}px, ${H * s.y}px) rotate(${s.r}deg)`;
    play(run, k, [
      { transform: `${base} scaleX(0)`, opacity: 1, transformOrigin: "0 50%" },
      { transform: `${base} scaleX(1)`, opacity: 1, offset: 0.3, transformOrigin: "0 50%" },
      { transform: `${base} scaleX(1)`, opacity: 1, offset: 0.75, transformOrigin: "0 50%" },
      { transform: `${base} scaleX(1)`, opacity: 0, transformOrigin: "0 50%" },
    ], { duration: ms - s.d, delay: s.d, easing: SNAP });
  });
  stamp(run, { ...from, y: from.y - from.h * 0.55 }, label, "shu", ms - 420);
  shock(run, to, W * 0.55, "shu");
}
