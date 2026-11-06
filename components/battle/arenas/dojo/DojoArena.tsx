"use client";

import { useRef } from "react";
import { ArenaBackdrop, particles, pulse, shower, useArenaHandle, type ArenaProps } from "../shared";
import "../arena.css";
import "./dojo.css";

// Le Dōjō de la lanterne (灯の道場), arène du palier Bronze : un dōjō de bois la nuit, shoji éclairés,
// shimenawa et andon. Le décor est une vidéo en boucle (lanternes, poussière et shide y bougent déjà),
// posée sur son image fixe ; le code ajoute les réactions : la lumière des shoji qui bat au tour, la
// poussière qui tombe des poutres et le dōjō qui tremble au critique et au KO, les lanternes qui
// vacillent au KO, l'éclat chaud de la technique, les papiers qui pleuvent à la victoire. Positions en
// unités de la toile 1200 × 900, relevées sur l'image.

const STILL = "/arenas/dojo/still-v1.webp";
const VIDEO = "/arenas/dojo/loop-v1.mp4";

/** Les deux andon posés aux bords (vus sur grand écran). */
const ANDONS = [
  { x: 25, y: 606 },
  { x: 1172, y: 606 },
] as const;

export function DojoArena({ level, handleRef }: ArenaProps) {
  const far = useRef<HTMLDivElement>(null);
  const shoji = useRef<HTMLDivElement>(null);
  const floor = useRef<HTMLDivElement>(null);
  const andons = useRef<HTMLDivElement>(null);
  const flicker = useRef<HTMLDivElement>(null);
  const flare = useRef<HTMLDivElement>(null);
  const fx = useRef<HTMLDivElement>(null);
  const dim = useRef<HTMLDivElement>(null);

  useArenaHandle(handleRef, [{ ref: far, depth: 0.25 }], (reaction) => {
    if (level === "reduced") return;
    switch (reaction) {
      case "turn":
        // Un coup sur le plancher : la lumière des shoji bat, son reflet court au sol
        pulse(shoji.current, [{ opacity: 0 }, { opacity: 0.8, offset: 0.18 }, { opacity: 0 }], { duration: 700 });
        pulse(floor.current, [{ opacity: 0 }, { opacity: 0.6, offset: 0.25 }, { opacity: 0 }], { duration: 800 });
        break;
      case "crit":
      case "ko":
        // Le dōjō tremble : la poussière tombe des poutres
        shower(fx.current, "dj-dust", particles(level, 24), { from: [0.06, 0.94], y0: 0.02, fall: 0.6, drift: 0.08, duration: 1_700 });
        pulse(far.current, [{ transform: "translate(0px, 0px)" }, { transform: "translate(1.5px, -1px)" }, { transform: "translate(-1.5px, 1px)" }, { transform: "translate(0px, 0px)" }], { duration: 280, composite: "add" });
        if (reaction === "ko") {
          // Les lumières vacillent : les andon et les shoji baissent, puis reprennent
          pulse(flicker.current, [{ opacity: 0 }, { opacity: 0.55, offset: 0.1 }, { opacity: 0.15, offset: 0.25 }, { opacity: 0.4, offset: 0.45 }, { opacity: 0 }], { duration: 1_600, easing: "linear" });
          andons.current?.querySelectorAll(".dj-andon-out").forEach((g, i) =>
            pulse(g, [{ opacity: 0 }, { opacity: 0.85, offset: 0.12 }, { opacity: 0.5, offset: 0.4 }, { opacity: 0 }], { duration: 2_200, delay: i * 120 }),
          );
        }
        break;
      case "technique":
        pulse(flare.current, [{ opacity: 0 }, { opacity: 0.55, offset: 0.3 }, { opacity: 0 }], { duration: 900 });
        break;
      case "victory":
        pulse(flare.current, [{ opacity: 0 }, { opacity: 0.7, offset: 0.3 }, { opacity: 0.25 }], { duration: 1_600, fill: "forwards" });
        shower(fx.current, "dj-confetti", particles(level, 42), { from: [0, 1], y0: -0.05, fall: 1.05, drift: 0.25, duration: 3_400, spin: 720 });
        break;
      case "defeat":
        pulse(dim.current, [{ opacity: 0 }, { opacity: 0.5 }], { duration: 1_400, fill: "forwards" });
        break;
      default:
        break;
    }
  });

  return (
    <div className="arena arena-dojo" data-level={level}>
      {/* Le décor en vidéo, et la lumière posée dessus : shoji, reflet au sol, andon qui vacillent */}
      <div ref={far} className="arena-plane">
        <ArenaBackdrop still={STILL} video={VIDEO} level={level} />
        <div ref={shoji} className="arena-prop dj-shoji" style={{ ["--px" as string]: 150, ["--py" as string]: 110, ["--pw" as string]: 900, ["--ph" as string]: 240 }} aria-hidden="true" />
        <div ref={floor} className="arena-prop dj-floor" style={{ ["--px" as string]: 250, ["--py" as string]: 300, ["--pw" as string]: 700, ["--ph" as string]: 260 }} aria-hidden="true" />
        <div ref={andons} aria-hidden="true">
          {ANDONS.map((a) => (
            <i key={a.x} className="arena-prop dj-andon-out" style={{ ["--px" as string]: a.x - 90, ["--py" as string]: a.y - 110, ["--pw" as string]: 180, ["--ph" as string]: 220 }} />
          ))}
        </div>
      </div>
      <div ref={flicker} className="dj-flicker" aria-hidden="true" />
      <div ref={flare} className="dj-flare" aria-hidden="true" />
      <div ref={fx} className="arena-fx" aria-hidden="true" />
      <div className="dj-vignette" aria-hidden="true" />
      <div ref={dim} className="arena-dim" aria-hidden="true" />
    </div>
  );
}
