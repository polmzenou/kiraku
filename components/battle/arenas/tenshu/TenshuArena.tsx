"use client";

import { useRef } from "react";
import { firstVisible, visibleCanvas, type CanvasView } from "@/lib/battle/arena-backdrop";
import { noise } from "../../fx/vfx";
import { ArenaBackdrop, canvasPoint, flashAt, particles, play, pulse, rainBurst, useArenaHandle, type ArenaProps } from "../shared";
import "../arena.css";
import "./tenshu.css";

// Le Donjon dans la tempête (嵐の天守閣), arène du palier Élite : la galerie d'une tourelle, la nuit,
// face au donjon sous l'orage. Le décor est une vidéo en boucle (pluie, nuages, bannières et flaques y
// bougent déjà), posée sur son image fixe ; le code n'ajoute que ce que le combat provoque : la foudre
// sur les critiques, les tuiles arrachées au KO, les éclairs de chaleur des techniques, les rafales du
// tambour, la percée de lumière de la victoire et le déluge de la défaite. Positions en unités de la
// toile 1200 × 900, relevées sur l'image.

const STILL = "/arenas/tenshu/still-v1.webp";
const VIDEO = "/arenas/tenshu/loop-v1.mp4";

/**
 * Où tombe la foudre : sur un shachihoko du donjon s'il se voit (téléphone), sinon sur un shachihoko des
 * tourelles (grand écran, où le haut du donjon passe au-dessus du cadre), sinon sur le pignon du donjon.
 * D'un critique à l'autre, elle change de côté.
 */
const KEEP = [
  { x: 515, y: 68 },
  { x: 685, y: 68 },
] as const;
const TURRETS = [
  { x: 112, y: 185 },
  { x: 1088, y: 185 },
  { x: 230, y: 185 },
  { x: 970, y: 185 },
] as const;
const GABLE = { x: 600, y: 215 };
/** Fenêtres allumées du donjon et des tourelles. */
const WINDOWS = [
  [522, 193], [677, 193], [600, 232], [462, 273], [507, 273], [553, 272], [170, 272], [991, 272], [1070, 272],
] as const;
/** Avancées de toit d'où le KO arrache des tuiles. */
const EAVES = [
  { x0: 380, x1: 820, y: 305 },
  { x0: 60, x1: 300, y: 255 },
  { x0: 900, x1: 1140, y: 255 },
] as const;
/** Éclairs de chaleur dans les nuages (techniques). */
const SHEETS = [
  { x: 330, y: 70, r: 280 },
  { x: 600, y: 30, r: 300 },
  { x: 880, y: 80, r: 280 },
] as const;

type Point = { x: number; y: number };

/** Le tracé d'un éclair de (x0, y0) à (x1, y1), dentelé, avec une branche s'il le faut (n : numéro du coup). */
function boltPaths(x0: number, y0: number, x1: number, y1: number, n: number, branch: boolean) {
  const steps = 8;
  const pts: [number, number][] = [[x0, y0]];
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    pts.push([x0 + (x1 - x0) * t + (noise(i + n * 17, 5) - 0.5) * 70 * (1 - t * 0.7), y0 + (y1 - y0) * t + (noise(i + n * 17, 9) - 0.5) * 12]);
  }
  pts.push([x1, y1]);
  const line = (p: [number, number][]) => p.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  const paths = [line(pts)];
  if (branch) {
    const [bx, by] = pts[3];
    const dir = noise(n, 23) > 0.5 ? 1 : -1;
    const b: [number, number][] = [[bx, by]];
    for (let i = 1; i <= 3; i++) b.push([bx + dir * i * 26 + (noise(i + n, 29) - 0.5) * 16, by + i * 22]);
    paths.push(line(b));
  }
  return paths;
}

/** La foudre : l'éclair (lueur, halo, cœur blanc) scintille deux fois, et son point d'impact s'embrase. */
function strike(layer: HTMLElement, target: Point, top: number, n: number, branch: boolean) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 1200 900");
  svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
  svg.setAttribute("class", "ts-bolt");
  const from = target.x + (noise(n, 31) - 0.5) * 120;
  for (const d of boltPaths(from, top, target.x, target.y, n, branch)) {
    for (const cls of ["ts-bolt-glow", "ts-bolt-halo", "ts-bolt-core"]) {
      const p = document.createElementNS(ns, "path");
      p.setAttribute("d", d);
      p.setAttribute("class", cls);
      svg.appendChild(p);
    }
  }
  layer.appendChild(svg);
  const flicker = [{ opacity: 0 }, { opacity: 1, offset: 0.05 }, { opacity: 0.2, offset: 0.14 }, { opacity: 0.95, offset: 0.24 }, { opacity: 0.15, offset: 0.42 }, { opacity: 0 }];
  const a = svg.animate(flicker, { duration: 750, easing: "linear" });
  a.finished.then(() => svg.remove(), () => svg.remove());

  const { x, y, s } = canvasPoint(layer, target.x, target.y);
  const size = 150 * s;
  const spark = document.createElement("span");
  spark.className = "ts-impact";
  spark.style.width = spark.style.height = `${size}px`;
  spark.style.left = `${x - size / 2}px`;
  spark.style.top = `${y - size / 2}px`;
  layer.appendChild(spark);
  const b = spark.animate(
    [
      { opacity: 0, transform: "scale(.5)" },
      { opacity: 1, transform: "scale(1)", offset: 0.08 },
      { opacity: 0.3, offset: 0.2 },
      { opacity: 0.8, offset: 0.28 },
      { opacity: 0, transform: "scale(1.3)" },
    ],
    { duration: 750, easing: "linear" },
  );
  b.finished.then(() => spark.remove(), () => spark.remove());
}

/** Des tuiles arrachées aux toits visibles, qui tombent en tournoyant jusqu'au pont. */
function tiles(layer: HTMLElement, view: CanvasView, count: number) {
  const eaves = EAVES.filter((e) => e.x1 > view.x0 + 20 && e.x0 < view.x1 - 20);
  if (count <= 0 || eaves.length === 0) return;
  for (let i = 0; i < count; i++) {
    const e = eaves[i % eaves.length];
    const lo = Math.max(e.x0, view.x0 + 20);
    const hi = Math.min(e.x1, view.x1 - 20);
    const { x, y, s } = canvasPoint(layer, lo + noise(i, 81) * (hi - lo), e.y);
    const t = document.createElement("span");
    t.className = "ts-tile";
    layer.appendChild(t);
    const fall = (240 + noise(i, 83) * 200) * s;
    const dx = (noise(i, 85) - 0.5) * 80 * s;
    const spin = (noise(i, 87) > 0.5 ? 1 : -1) * (300 + noise(i, 89) * 300);
    const a = t.animate(
      [
        { transform: `translate(${x}px, ${y}px) rotate(0deg) scale(${s})`, opacity: 0 },
        { transform: `translate(${x + dx * 0.2}px, ${y + fall * 0.1}px) rotate(${spin * 0.15}deg) scale(${s})`, opacity: 1, offset: 0.1 },
        { transform: `translate(${x + dx}px, ${y + fall}px) rotate(${spin}deg) scale(${s})`, opacity: 0 },
      ],
      { duration: 1_100 + noise(i, 91) * 500, delay: noise(i, 93) * 250, easing: "cubic-bezier(.45,0,.8,.6)", fill: "both" },
    );
    a.finished.then(() => t.remove(), () => t.remove());
  }
}

export function TenshuArena({ level, handleRef, sound }: ArenaProps) {
  const far = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const sheets = useRef<HTMLDivElement>(null);
  const glows = useRef<HTMLDivElement>(null);
  const beam = useRef<HTMLDivElement>(null);
  const bolts = useRef<HTMLDivElement>(null);
  const clear = useRef<HTMLDivElement>(null);
  const rain = useRef<HTMLDivElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const dim = useRef<HTMLDivElement>(null);
  const strikes = useRef(0);

  useArenaHandle(handleRef, [{ ref: far, depth: 0.25 }], (reaction) => {
    if (level === "reduced") return;
    const layer = bolts.current;
    switch (reaction) {
      case "turn":
        // Le tambour de guerre : les fenêtres du donjon vacillent, une rafale passe
        pulse(glows.current, [{ opacity: 0 }, { opacity: 0.9, offset: 0.2 }, { opacity: 0.3, offset: 0.45 }, { opacity: 0.7, offset: 0.6 }, { opacity: 0 }], { duration: 900, easing: "linear" });
        rainBurst(rain.current, [{ opacity: 0 }, { opacity: 0.75, offset: 0.25 }, { opacity: 0 }], 900);
        play(sound, "drum");
        break;
      case "crit": {
        if (!layer) break;
        strikes.current += 1;
        const n = strikes.current;
        const view = visibleCanvas(layer.clientWidth, layer.clientHeight);
        const target = firstVisible([KEEP[n % 2], TURRETS[n % 4], GABLE], view);
        strike(layer, target, view.y0 - 20, n, level === "full");
        flashAt(flash.current, layer, target, 0.9);
        play(sound, "thunder");
        break;
      }
      case "ko":
        if (!layer) break;
        tiles(layer, visibleCanvas(layer.clientWidth, layer.clientHeight), particles(level, 14));
        flashAt(flash.current, layer, GABLE, 0.35);
        break;
      case "technique":
        // Des éclairs de chaleur courent dans les nuages, d'un bord à l'autre
        sheets.current?.querySelectorAll(".ts-sheet").forEach((el, i) =>
          pulse(el, [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 0.2, offset: 0.25 }, { opacity: 0.75, offset: 0.4 }, { opacity: 0 }], { duration: 900, delay: i * 180, easing: "linear" }),
        );
        break;
      case "victory":
        // Les nuages s'ouvrent sur le donjon, la pluie se calme
        pulse(beam.current, [{ opacity: 0 }, { opacity: 0.9 }], { duration: 2_000, fill: "forwards" });
        pulse(clear.current, [{ opacity: 0 }, { opacity: 0.6 }], { duration: 2_400, fill: "forwards" });
        if (video.current) video.current.playbackRate = 0.75;
        break;
      case "defeat":
        // Le déluge : un rideau de pluie serrée, la nuit gagne
        rainBurst(rain.current, [{ opacity: 0 }, { opacity: 0.85 }], 1_200, true);
        pulse(dim.current, [{ opacity: 0 }, { opacity: 0.55 }], { duration: 1_600, fill: "forwards" });
        break;
      default:
        break;
    }
  });

  return (
    <div className="arena arena-tenshu" data-level={level}>
      {/* Le décor en vidéo, et la lumière posée dessus : éclairs de chaleur, fenêtres, percée, foudre */}
      <div ref={far} className="arena-plane">
        <ArenaBackdrop still={STILL} video={VIDEO} level={level} videoRef={video} />
        <div ref={sheets} aria-hidden="true">
          {SHEETS.map((p) => (
            <i key={p.x} className="arena-prop ts-sheet" style={{ ["--px" as string]: p.x - p.r, ["--py" as string]: p.y - p.r * 0.6, ["--pw" as string]: p.r * 2, ["--ph" as string]: p.r * 1.2 }} />
          ))}
        </div>
        <div ref={glows} className="ts-glows" aria-hidden="true">
          {WINDOWS.map(([x, y]) => (
            <i key={`${x}-${y}`} className="arena-prop ts-glow" style={{ ["--px" as string]: x - 30, ["--py" as string]: y - 30, ["--pw" as string]: 60, ["--ph" as string]: 60 }} />
          ))}
        </div>
        <div ref={beam} className="arena-prop ts-beam" style={{ ["--px" as string]: 360, ["--py" as string]: -80, ["--pw" as string]: 480, ["--ph" as string]: 520 }} aria-hidden="true" />
        <div ref={bolts} className="arena-fx" aria-hidden="true" />
      </div>
      <div ref={clear} className="ts-clear" aria-hidden="true" />
      <div ref={rain} className="arena-rain" aria-hidden="true" />
      <div ref={flash} className="arena-flash" aria-hidden="true" />
      <div className="ts-vignette" aria-hidden="true" />
      <div ref={dim} className="arena-dim" aria-hidden="true" />
    </div>
  );
}
