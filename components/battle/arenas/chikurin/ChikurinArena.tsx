"use client";

import { useRef } from "react";
import { ArenaBackdrop, moteStyle, particles, pulse, shower, useArenaHandle, type ArenaProps } from "../shared";
import "../arena.css";
import "./chikurin.css";

// La Bambouseraie au clair de lune (月下の竹林), arène du palier Argent : une forêt de bambous la nuit,
// sous la pleine lune, dans la brume. Le décor est une vidéo en boucle (bambous, brume, nuages et filet
// d'eau du shishi-odoshi y bougent déjà), posée sur son image fixe ; le code ajoute les lucioles, et les
// réactions : des feuilles qui tombent quand un coup porte, le coup de vent du critique et du KO (feuilles
// emportées, brume chassée, lucioles qui s'enfuient), le halo de la lune à la technique, les lucioles qui
// montent à la victoire. Positions en unités de la toile 1200 × 900, relevées sur l'image.

const STILL = "/arenas/chikurin/still-v1.webp";
const VIDEO = "/arenas/chikurin/loop-v1.mp4";

/** La lune, entre les bambous. */
const MOON = { x: 652, y: 148, r: 65 };

export function ChikurinArena({ level, handleRef }: ArenaProps) {
  const far = useRef<HTMLDivElement>(null);
  const halo = useRef<HTMLDivElement>(null);
  const flies = useRef<HTMLDivElement>(null);
  const gust = useRef<HTMLDivElement>(null);
  const fx = useRef<HTMLDivElement>(null);
  const dim = useRef<HTMLDivElement>(null);

  useArenaHandle(handleRef, [{ ref: far, depth: 0.25 }], (reaction) => {
    if (level === "reduced") return;
    switch (reaction) {
      case "hit":
        shower(fx.current, "ck-leaf", particles(level, 4), { from: [0.15, 0.85], y0: 0.05, fall: 0.6, drift: 0.2, duration: 2_200, spin: 360 });
        break;
      case "crit":
      case "ko":
        // Coup de vent : les feuilles volent, la brume est chassée, les lucioles s'enfuient puis reviennent
        shower(fx.current, "ck-leaf", particles(level, 18), { from: [0, 0.4], y0: 0.15, fall: 0.45, drift: 1.1, duration: 1_700, spin: 720 });
        pulse(gust.current, [{ transform: "translateX(-35%)", opacity: 0 }, { transform: "translateX(0%)", opacity: 0.7, offset: 0.4 }, { transform: "translateX(35%)", opacity: 0 }], { duration: 1_500, easing: "ease-in-out" });
        pulse(flies.current, [{ transform: "translate(0px, 0px)", opacity: 1 }, { transform: "translate(40px, -60px)", opacity: 0, offset: 0.3 }, { transform: "translate(0px, 0px)", opacity: 0, offset: 0.7 }, { transform: "translate(0px, 0px)", opacity: 1 }], { duration: 3_200 });
        break;
      case "technique":
        pulse(halo.current, [{ opacity: 0 }, { opacity: 0.9, offset: 0.3 }, { opacity: 0 }], { duration: 1_200 });
        break;
      case "victory":
        pulse(flies.current, [{ transform: "translateY(0px)" }, { transform: "translateY(-30%)" }], { duration: 4_000, fill: "forwards", easing: "ease-in" });
        pulse(halo.current, [{ opacity: 0 }, { opacity: 0.8 }], { duration: 1_500, fill: "forwards" });
        break;
      case "defeat":
        pulse(dim.current, [{ opacity: 0 }, { opacity: 0.55 }], { duration: 1_600, fill: "forwards" });
        break;
      default:
        break;
    }
  });

  const count = particles(level, 18);

  return (
    <div className="arena arena-chikurin" data-level={level}>
      {/* Le décor en vidéo, le halo de la lune et les lucioles, dans le même plan */}
      <div ref={far} className="arena-plane">
        <ArenaBackdrop still={STILL} video={VIDEO} level={level} />
        <div ref={halo} className="arena-prop ck-halo" style={{ ["--px" as string]: MOON.x - MOON.r * 3, ["--py" as string]: MOON.y - MOON.r * 3, ["--pw" as string]: MOON.r * 6, ["--ph" as string]: MOON.r * 6 }} aria-hidden="true" />
        {count > 0 && (
          <div ref={flies} className="ck-flies" aria-hidden="true">
            {Array.from({ length: count }, (_, i) => (
              <span key={i} className="ck-fly" style={moteStyle(i, 23, { x: [6, 94], y: [42, 86] }, [5, 9], [3, 6])} />
            ))}
          </div>
        )}
      </div>
      <div ref={gust} className="ck-gust" aria-hidden="true" />
      <div ref={fx} className="arena-fx" aria-hidden="true" />
      <div className="ck-vignette" aria-hidden="true" />
      <div ref={dim} className="arena-dim" aria-hidden="true" />
    </div>
  );
}
