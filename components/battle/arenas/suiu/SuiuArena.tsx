"use client";

import Image from "next/image";
import { useRef } from "react";
import { visibleCanvas, type CanvasView } from "@/lib/battle/arena-backdrop";
import { noise } from "../../fx/vfx";
import { ArenaBackdrop, canvasPoint, flashAt, particles, play, pulse, rainBurst, useArenaHandle, type ArenaProps } from "../shared";
import "../arena.css";
import "./suiu.css";

// Le Jardin de jade sous la pluie (翠雨の庭), arène du palier Émeraude : un jardin de promenade au
// crépuscule sous l'averse, autour d'un étang. Le décor est une vidéo en boucle (pluie, ronds dans
// l'eau, koi sous la surface, saule et brume y bougent déjà), posée sur son image fixe ; le code ajoute
// les réactions : des ronds sur l'étang au tour, la foudre et l'averse qui redouble au critique, un koi
// qui bondit hors de l'eau au KO (image détourée), l'éclaircie de la technique et de la victoire, le
// déluge de la défaite. Positions en unités de la toile 1200 × 900, relevées sur l'image.

const STILL = "/arenas/suiu/still-v1.webp";
const VIDEO = "/arenas/suiu/loop-v1.mp4";
const KOI = "/arenas/suiu/koi-v1.webp";

/** La surface de l'étang, du pied du pont à la rive ; le héron se tient vers x 444. */
const POND = { x0: 300, x1: 1000, y0: 380, y1: 550 } as const;
const HERON_X = 444;

/** Des points de l'étang qui se voient dans ce cadrage, loin du héron (n : salage de la suite). */
function pondSpots(view: CanvasView, count: number, salt: number) {
  const lo = Math.max(POND.x0, view.x0 + 60);
  const hi = Math.min(POND.x1, view.x1 - 60);
  const spots: { x: number; y: number }[] = [];
  for (let i = 0; spots.length < count && i < count * 6; i++) {
    const x = lo + noise(i, salt) * (hi - lo);
    if (Math.abs(x - HERON_X) < 55) continue;
    spots.push({ x, y: POND.y0 + 20 + noise(i, salt + 1) * (POND.y1 - POND.y0 - 40) });
  }
  return spots;
}

/** Des ronds qui s'élargissent à la surface de l'étang, aplatis par la perspective. */
function ripples(layer: HTMLElement, at: readonly { x: number; y: number }[], size: number, delay = 0) {
  at.forEach((p, i) => {
    const { x, y, s } = canvasPoint(layer, p.x, p.y);
    const w = size * s;
    for (let k = 0; k < 2; k++) {
      const r = document.createElement("span");
      r.className = "sy-ripple";
      r.style.width = `${w}px`;
      r.style.height = `${w * 0.32}px`;
      r.style.left = `${x - w / 2}px`;
      r.style.top = `${y - w * 0.16}px`;
      layer.appendChild(r);
      const a = r.animate([{ transform: "scale(.15)", opacity: 0.9 }, { transform: "scale(1)", opacity: 0 }], { duration: 1_500, delay: delay + i * 160 + k * 260, easing: "cubic-bezier(.2,.6,.4,1)", fill: "both" });
      a.finished.then(() => r.remove(), () => r.remove());
    }
  });
}

/** Des gouttes projetées par le koi, qui retombent dans l'étang. */
function droplets(layer: HTMLElement, at: { x: number; y: number }, count: number, delay: number) {
  const { x, y, s } = canvasPoint(layer, at.x, at.y);
  for (let i = 0; i < count; i++) {
    const d = document.createElement("span");
    d.className = "sy-drop";
    layer.appendChild(d);
    const dx = (noise(i, 71) - 0.5) * 90 * s;
    const up = (40 + noise(i, 73) * 70) * s;
    const a = d.animate(
      [
        { transform: `translate(${x}px, ${y}px) scale(1)`, opacity: 0 },
        { transform: `translate(${x + dx * 0.5}px, ${y - up}px) scale(1)`, opacity: 1, offset: 0.4 },
        { transform: `translate(${x + dx}px, ${y + 10 * s}px) scale(.6)`, opacity: 0 },
      ],
      { duration: 700 + noise(i, 77) * 300, delay, easing: "cubic-bezier(.3,.6,.6,1)", fill: "both" },
    );
    a.finished.then(() => d.remove(), () => d.remove());
  }
}

export function SuiuArena({ level, handleRef, sound }: ArenaProps) {
  const far = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const water = useRef<HTMLDivElement>(null);
  const koi = useRef<HTMLImageElement>(null);
  const sun = useRef<HTMLDivElement>(null);
  const rain = useRef<HTMLDivElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const dim = useRef<HTMLDivElement>(null);
  const turns = useRef(0);
  const leaps = useRef(0);

  /** Le koi bondit en arc hors de l'étang, là où l'étang se voit, puis replonge dans une gerbe. */
  const leap = () => {
    const layer = water.current;
    const fish = koi.current;
    if (!layer || !fish) return;
    leaps.current += 1;
    const view = visibleCanvas(layer.clientWidth, layer.clientHeight);
    const [from] = pondSpots(view, 1, 40 + leaps.current * 7);
    if (!from) return;
    const dir = from.x > (view.x0 + view.x1) / 2 ? -1 : 1;
    const to = { x: from.x + dir * 150, y: from.y };
    const a = canvasPoint(layer, from.x, from.y);
    const b = canvasPoint(layer, to.x, to.y);
    const w = 150 * a.s;
    fish.style.width = `${w}px`;
    const flip = dir < 0 ? -1 : 1;
    const at = (x: number, y: number, deg: number, sc: number) => `translate(${x - w / 2}px, ${y - w * 0.39}px) scale(${flip * sc}, ${sc}) rotate(${deg}deg)`;
    const apex = 120 * a.s;
    pulse(
      fish,
      [
        // L'image montre le koi tête en haut à droite : l'arc le fait pivoter du nez levé au nez plongeant
        { transform: at(a.x, a.y + 10 * a.s, -10, 0.85), opacity: 0 },
        { transform: at(a.x + (b.x - a.x) * 0.2, a.y - apex * 0.7, 5, 0.95), opacity: 1, offset: 0.2 },
        { transform: at((a.x + b.x) / 2, a.y - apex, 35, 1), opacity: 1, offset: 0.5 },
        { transform: at(a.x + (b.x - a.x) * 0.82, a.y - apex * 0.55, 65, 0.95), opacity: 1, offset: 0.82 },
        { transform: at(b.x, b.y + 12 * a.s, 85, 0.85), opacity: 0 },
      ],
      { duration: 1_300, easing: "linear" },
    );
    ripples(layer, [from], 130);
    ripples(layer, [to], 150, 1_050);
    droplets(layer, from, particles(level, 8), 0);
    droplets(layer, to, particles(level, 10), 1_050);
    setTimeout(() => play(sound, "splash"), 1_100);
  };

  useArenaHandle(handleRef, [{ ref: far, depth: 0.25 }], (reaction) => {
    if (level === "reduced") return;
    const layer = water.current;
    switch (reaction) {
      case "turn":
        // Des gouttes plus lourdes tombent des arbres : des ronds s'ouvrent sur l'étang
        if (!layer) break;
        turns.current += 1;
        ripples(layer, pondSpots(visibleCanvas(layer.clientWidth, layer.clientHeight), level === "full" ? 3 : 1, 10 + turns.current * 3), 110);
        break;
      case "crit":
        // L'éclair, deux lueurs sous le seuil des flashs, puis l'averse redouble
        flashAt(flash.current, layer, { x: 600, y: 40 }, 0.8);
        rainBurst(rain.current, [{ opacity: 0 }, { opacity: 0.7, offset: 0.2 }, { opacity: 0.7, offset: 0.7 }, { opacity: 0 }], 2_600);
        play(sound, "thunder");
        break;
      case "ko":
        leap();
        break;
      case "technique":
        pulse(sun.current, [{ opacity: 0 }, { opacity: 0.8, offset: 0.3 }, { opacity: 0 }], { duration: 1_400 });
        break;
      case "victory":
        // L'éclaircie : la lumière dorée perce, la pluie se calme
        pulse(sun.current, [{ opacity: 0 }, { opacity: 0.9 }], { duration: 2_400, fill: "forwards" });
        if (video.current) video.current.playbackRate = 0.7;
        break;
      case "defeat":
        rainBurst(rain.current, [{ opacity: 0 }, { opacity: 0.85 }], 1_200, true);
        pulse(dim.current, [{ opacity: 0 }, { opacity: 0.5 }], { duration: 1_600, fill: "forwards" });
        break;
      default:
        break;
    }
  });

  return (
    <div className="arena arena-suiu" data-level={level}>
      {/* Le décor en vidéo, puis l'étang animé : ronds, gouttes et le koi qui saute */}
      <div ref={far} className="arena-plane">
        <ArenaBackdrop still={STILL} video={VIDEO} level={level} videoRef={video} />
        <div ref={water} className="arena-fx" aria-hidden="true">
          <Image ref={koi} className="sy-koi" src={KOI} alt="" width={480} height={377} unoptimized draggable={false} />
        </div>
      </div>
      <div ref={sun} className="sy-sun" aria-hidden="true" />
      <div ref={rain} className="arena-rain" aria-hidden="true" />
      <div ref={flash} className="arena-flash sy-flash" aria-hidden="true" />
      <div className="sy-vignette" aria-hidden="true" />
      <div ref={dim} className="arena-dim" aria-hidden="true" />
    </div>
  );
}
