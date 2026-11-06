"use client";

import { useRef } from "react";
import { ArenaBackdrop, particles, pulse, shower, useArenaHandle, type ArenaProps } from "../shared";
import "../arena.css";
import "./torii.css";

// Le Sanctuaire aux mille torii (千本鳥居), arène du palier Or : un tunnel de torii vermillon au
// couchant, lanternes de pierre, renards de pierre à bavoir rouge, érables. Le décor est une vidéo en
// boucle (rayons, lanternes, brume et branches y bougent déjà), posée sur son image fixe ; le code ajoute
// les réactions : l'éclat de la cloche au tour, le tourbillon d'érable et les rayons du critique et du
// KO, les yeux des renards qui s'allument au KO, les lanternes qui s'embrasent à la technique, la pluie
// de feuilles de la victoire. Positions en unités de la toile 1200 × 900, relevées sur l'image.

const STILL = "/arenas/torii/still-v1.webp";
const VIDEO = "/arenas/torii/loop-v1.mp4";

/** Le soleil couchant au bout du tunnel. */
const SUN = { x: 600, y: 294 };
/** Lanternes de pierre le long du chemin : les deux grandes (grand écran), puis celles du tunnel. */
const LAMPS = [
  { x: 322, y: 475, r: 46 },
  { x: 875, y: 475, r: 46 },
  { x: 435, y: 419, r: 30 },
  { x: 760, y: 419, r: 30 },
  { x: 478, y: 394, r: 22 },
  { x: 719, y: 394, r: 22 },
] as const;
/** Les yeux mi-clos des deux renards de pierre (grand écran). */
const EYES = [
  { x: 34, y: 547 },
  { x: 60, y: 547 },
  { x: 1140, y: 548 },
  { x: 1168, y: 548 },
] as const;
/** La cloche au bout de sa corde (grand écran). */
const BELL = { x: 1022, y: 244 };

export function ToriiArena({ level, handleRef }: ArenaProps) {
  const far = useRef<HTMLDivElement>(null);
  const rays = useRef<HTMLDivElement>(null);
  const lamps = useRef<HTMLDivElement>(null);
  const eyes = useRef<HTMLDivElement>(null);
  const bell = useRef<HTMLDivElement>(null);
  const flare = useRef<HTMLDivElement>(null);
  const fx = useRef<HTMLDivElement>(null);
  const dim = useRef<HTMLDivElement>(null);

  useArenaHandle(handleRef, [{ ref: far, depth: 0.25 }], (reaction) => {
    if (level === "reduced") return;
    switch (reaction) {
      case "turn":
        // La cloche tinte : un éclat d'or sur le grelot, les lanternes respirent
        pulse(bell.current, [{ opacity: 0, transform: "scale(.6)" }, { opacity: 1, transform: "scale(1)", offset: 0.2 }, { opacity: 0, transform: "scale(1.3)" }], { duration: 800 });
        lamps.current?.querySelectorAll(".tr-lamp").forEach((l) => pulse(l, [{ opacity: 0 }, { opacity: 0.6, offset: 0.25 }, { opacity: 0 }], { duration: 900 }));
        break;
      case "crit":
      case "ko":
        // Un tourbillon d'érable, les rayons du couchant s'embrasent
        shower(fx.current, "tr-leaf", particles(level, 18), { from: [0.1, 0.9], y0: 0.2, fall: 0.5, drift: 0.7, duration: 1_500, spin: 540 });
        pulse(rays.current, [{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], { duration: 1_100 });
        if (reaction === "ko") pulse(eyes.current, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 1_800 });
        break;
      case "technique":
        lamps.current?.querySelectorAll(".tr-lamp").forEach((l, i) => pulse(l, [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: 900, delay: i * 60, fill: "backwards" }));
        pulse(flare.current, [{ opacity: 0 }, { opacity: 0.45, offset: 0.3 }, { opacity: 0 }], { duration: 900 });
        break;
      case "victory":
        pulse(flare.current, [{ opacity: 0 }, { opacity: 0.75, offset: 0.3 }, { opacity: 0.3 }], { duration: 1_800, fill: "forwards" });
        pulse(rays.current, [{ opacity: 0 }, { opacity: 0.8 }], { duration: 1_800, fill: "forwards" });
        shower(fx.current, "tr-leaf", particles(level, 40), { from: [0, 1], y0: -0.05, fall: 1.05, drift: 0.3, duration: 3_600, spin: 720 });
        break;
      case "defeat":
        pulse(dim.current, [{ opacity: 0 }, { opacity: 0.55 }], { duration: 1_400, fill: "forwards" });
        break;
      default:
        break;
    }
  });

  return (
    <div className="arena arena-torii" data-level={level}>
      {/* Le décor en vidéo, et la lumière posée dessus : rayons, lanternes, yeux des renards, cloche */}
      <div ref={far} className="arena-plane">
        <ArenaBackdrop still={STILL} video={VIDEO} level={level} />
        <div ref={rays} className="arena-prop tr-rays" style={{ ["--px" as string]: SUN.x - 260, ["--py" as string]: SUN.y - 200, ["--pw" as string]: 520, ["--ph" as string]: 400 }} aria-hidden="true" />
        <div ref={lamps} className="tr-lamps" aria-hidden="true">
          {LAMPS.map((l) => (
            <i key={l.x} className="arena-prop tr-lamp" style={{ ["--px" as string]: l.x - l.r, ["--py" as string]: l.y - l.r, ["--pw" as string]: l.r * 2, ["--ph" as string]: l.r * 2 }} />
          ))}
        </div>
        <div ref={eyes} className="tr-eyes" aria-hidden="true">
          {EYES.map((e) => (
            <i key={e.x} className="arena-prop tr-eye" style={{ ["--px" as string]: e.x - 9, ["--py" as string]: e.y - 4, ["--pw" as string]: 18, ["--ph" as string]: 8 }} />
          ))}
        </div>
        <div ref={bell} className="arena-prop tr-glint" style={{ ["--px" as string]: BELL.x - 40, ["--py" as string]: BELL.y - 40, ["--pw" as string]: 80, ["--ph" as string]: 80 }} aria-hidden="true" />
      </div>
      <div ref={flare} className="tr-flare" aria-hidden="true" />
      <div ref={fx} className="arena-fx" aria-hidden="true" />
      <div className="tr-vignette" aria-hidden="true" />
      <div ref={dim} className="arena-dim" aria-hidden="true" />
    </div>
  );
}
