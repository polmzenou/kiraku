"use client";

import { useRef } from "react";
import { ArenaBackdrop, particles, play, pulse, shower, useArenaHandle, type ArenaProps } from "../shared";
import "../arena.css";
import "./takamagahara.css";

// Le Palais céleste (高天原), arène du palier Grand champion : une plate-forme de nacre au-dessus d'une
// mer de nuages, à l'aube, sous un soleil nacré, des voiles hagoromo et deux palais lointains. Le décor
// est une vidéo en boucle (nuages, voiles et reflets de nacre y bougent déjà), posée sur son image fixe ;
// le code ajoute les réactions : l'onde du soleil et le carillon au tour, le faisceau de lumière du
// critique, les plumes qui tombent au KO, le halo de la technique, la traînée dorée qui traverse le ciel
// à la victoire. Positions en unités de la toile 1200 × 900, relevées sur l'image.

const STILL = "/arenas/takamagahara/still-v1.webp";
const VIDEO = "/arenas/takamagahara/loop-v1.mp4";

/** Le soleil nacré, au-dessus de la mer de nuages, et le point de la plate-forme où tombe son faisceau. */
const SUN = { x: 600, y: 169, r: 100 };
const PLATFORM = { x: 600, y: 520 };

export function TakamagaharaArena({ level, handleRef, sound }: ArenaProps) {
  const far = useRef<HTMLDivElement>(null);
  const halo = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const beam = useRef<HTMLDivElement>(null);
  const impact = useRef<HTMLDivElement>(null);
  const streak = useRef<HTMLDivElement>(null);
  const fx = useRef<HTMLDivElement>(null);
  const dim = useRef<HTMLDivElement>(null);

  useArenaHandle(handleRef, [{ ref: far, depth: 0.25 }], (reaction) => {
    if (level === "reduced") return;
    switch (reaction) {
      case "turn":
        pulse(ring.current, [{ opacity: 0.8, transform: "scale(.85)" }, { opacity: 0, transform: "scale(1.7)" }], { duration: 1_300, easing: "cubic-bezier(.1,.6,.3,1)" });
        play(sound, "chime");
        break;
      case "crit":
        // Un faisceau descend du soleil sur la plate-forme
        pulse(beam.current, [{ opacity: 0, transform: "scaleX(.4)" }, { opacity: 1, transform: "scaleX(1)", offset: 0.25 }, { opacity: 0, transform: "scaleX(1.3)" }], { duration: 1_300 });
        pulse(impact.current, [{ opacity: 0, transform: "scale(.5)" }, { opacity: 1, transform: "scale(1)", offset: 0.3 }, { opacity: 0, transform: "scale(1.4)" }], { duration: 1_300 });
        break;
      case "ko":
        shower(fx.current, "tk-feather", particles(level, 14), { from: [0.1, 0.9], y0: -0.04, fall: 0.9, drift: 0.3, duration: 3_400, spin: 420 });
        break;
      case "technique":
        pulse(halo.current, [{ opacity: 0 }, { opacity: 0.9, offset: 0.3 }, { opacity: 0 }], { duration: 1_200 });
        break;
      case "victory":
        // Une traînée dorée traverse le ciel, le soleil s'embrase
        // Le calque fait 420 unités de large : de -110 % à 240 %, sa tête traverse toute la toile en montant
        pulse(
          streak.current,
          [
            { transform: "translate(-110%, 160%) rotate(-8deg)", opacity: 0 },
            { transform: "translate(40%, 60%) rotate(-8deg)", opacity: 1, offset: 0.3 },
            { transform: "translate(170%, -40%) rotate(-8deg)", opacity: 1, offset: 0.75 },
            { transform: "translate(240%, -90%) rotate(-8deg)", opacity: 0 },
          ],
          { duration: 3_000, easing: "cubic-bezier(.4,.1,.5,1)" },
        );
        pulse(halo.current, [{ opacity: 0 }, { opacity: 0.8 }], { duration: 1_600, fill: "forwards" });
        shower(fx.current, "tk-feather", particles(level, 18), { from: [0, 1], y0: -0.05, fall: 1, drift: 0.3, duration: 3_800, spin: 360, delay: 600 });
        play(sound, "chime");
        break;
      case "defeat":
        pulse(dim.current, [{ opacity: 0 }, { opacity: 0.5 }], { duration: 1_600, fill: "forwards" });
        break;
      default:
        break;
    }
  });

  return (
    <div className="arena arena-takamagahara" data-level={level}>
      {/* Le décor en vidéo, et la lumière posée dessus : halo et onde du soleil, faisceau, traînée */}
      <div ref={far} className="arena-plane">
        <ArenaBackdrop still={STILL} video={VIDEO} level={level} />
        <div ref={halo} className="arena-prop tk-halo" style={{ ["--px" as string]: SUN.x - SUN.r * 2.6, ["--py" as string]: SUN.y - SUN.r * 2.6, ["--pw" as string]: SUN.r * 5.2, ["--ph" as string]: SUN.r * 5.2 }} aria-hidden="true" />
        <div ref={ring} className="arena-prop tk-ring" style={{ ["--px" as string]: SUN.x - SUN.r * 1.15, ["--py" as string]: SUN.y - SUN.r * 1.15, ["--pw" as string]: SUN.r * 2.3, ["--ph" as string]: SUN.r * 2.3 }} aria-hidden="true" />
        <div ref={beam} className="arena-prop tk-beam" style={{ ["--px" as string]: SUN.x - 120, ["--py" as string]: SUN.y, ["--pw" as string]: 240, ["--ph" as string]: 560 }} aria-hidden="true" />
        <div ref={impact} className="arena-prop tk-impact" style={{ ["--px" as string]: PLATFORM.x - 170, ["--py" as string]: PLATFORM.y - 70, ["--pw" as string]: 340, ["--ph" as string]: 140 }} aria-hidden="true" />
        <div ref={streak} className="arena-prop tk-streak" style={{ ["--px" as string]: 0, ["--py" as string]: 60, ["--pw" as string]: 420, ["--ph" as string]: 60 }} aria-hidden="true" />
      </div>
      <div ref={fx} className="arena-fx" aria-hidden="true" />
      <div className="tk-vignette" aria-hidden="true" />
      <div ref={dim} className="arena-dim" aria-hidden="true" />
    </div>
  );
}
