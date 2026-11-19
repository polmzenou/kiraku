"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import type { FudaCopy } from "../fuda/Fuda";
import { animate, createTimeline, dispose, EASE, later, SPRING, wait } from "../shop/celebration/timeline";
import { useRitualFx } from "./useRitualFx";
import "./BarenReveal.css";

// Révélation d'une édition gravée, après le grand moment de la rareté (environ 1,6 s) : la baren (tampon de
// l'estampeur) frotte la carte en zigzag et l'encre apparaît bande par bande sous son passage ; la carte reçoit alors
// son cartouche d'édition, les bandes s'effacent, le numéro s'écrit, puis le sceau du tirage se pose.
// transform et opacity seulement ; démonté (carte suivante) : tout s'arrête. Le mouvement réduit ne la joue pas.

const BANDS = 5;
// Zigzag de la baren, en fractions de la carte : départ hors champ à gauche, sortie à droite
const PATH: [number, number][] = [[-0.45, 0.02], [0.55, 0.1], [0.02, 0.26], [0.58, 0.4], [0.04, 0.54], [0.56, 0.68], [1.2, 0.74]];

export function BarenReveal({ copy, delay, onInked, onDone }: { copy: FudaCopy; delay: number; onInked: () => void; onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const baren = useRef<HTMLSpanElement>(null);
  const bands = useRef<(HTMLSpanElement | null)[]>([]);
  const ink = useRef<HTMLSpanElement>(null);
  const seal = useRef<HTMLSpanElement>(null);
  const { play } = useRitualFx();
  // Rappels du parent lus au moment voulu, sans relancer la séquence à chaque rendu
  const callbacks = useRef({ onInked, onDone, play });
  useEffect(() => {
    callbacks.current = { onInked, onDone, play };
  });

  useEffect(() => {
    const box = root.current?.getBoundingClientRect();
    if (!box || !baren.current || !ink.current || !seal.current) return;
    const tl = createTimeline(false);
    const { width: w, height: h } = box;
    const run = async () => {
      await wait(tl, delay);
      const rub = PATH.length - 1;
      const step = 820 / rub;
      animate(tl, baren.current!, [{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }], { duration: 820 + 120, easing: "linear" });
      animate(
        tl,
        baren.current!,
        PATH.map(([x, y], i) => ({ transform: `translate(${Math.round(x * w)}px, ${Math.round(y * h)}px) rotate(${i % 2 ? 9 : -9}deg)` })),
        { duration: 820 + 120, easing: "ease-in-out" },
      );
      later(tl, 60, () => callbacks.current.play("brush"));
      later(tl, 480, () => callbacks.current.play("brush"));
      // Chaque bande apparaît quand la baren la traverse
      bands.current.forEach((band, i) => {
        if (band) animate(tl, band, [{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 90 + i * step, easing: EASE });
      });
      await wait(tl, 820 + 140);
      // Gravure définitive sur la carte : les bandes s'effacent derrière elle
      callbacks.current.onInked();
      bands.current.forEach((band) => band && animate(tl, band, [{ opacity: 1 }, { opacity: 0 }], { duration: 220 }));
      // Le numéro s'écrit au pinceau, puis le sceau du tirage se pose
      animate(tl, ink.current!, [
        { opacity: 0, transform: "translateY(6px) scaleX(.7)" },
        { opacity: 1, transform: "translateY(0) scaleX(1)" },
      ], { duration: 320, easing: EASE });
      later(tl, 40, () => callbacks.current.play("brush"));
      await wait(tl, 360);
      animate(tl, seal.current!, [
        { opacity: 0, transform: "scale(2.4) rotate(-24deg)" },
        { opacity: 1, transform: "scale(1) rotate(-8deg)" },
      ], { duration: 260, easing: SPRING });
      later(tl, 120, () => callbacks.current.play("stamp", 40));
      await wait(tl, 520);
      animate(tl, root.current!, [{ opacity: 1 }, { opacity: 0 }], { duration: 240 });
      await wait(tl, 260);
      callbacks.current.onDone();
    };
    void run();
    return () => dispose(tl);
  }, [delay]);

  return (
    <div ref={root} aria-hidden="true" className="baren-reveal">
      {Array.from({ length: BANDS }, (_, i) => (
        <span
          key={i}
          ref={(node) => {
            bands.current[i] = node;
          }}
          className="baren-band"
          style={{ top: `${(i * 100) / BANDS}%`, height: `${100 / BANDS + 1}%`, "--band": i } as CSSProperties}
        />
      ))}
      <span ref={baren} className="baren-pad" />
      <span ref={ink} className="baren-ink">
        <b>{copy.serial}</b>
        {copy.size != null && <s>/{copy.size}</s>}
      </span>
      <span ref={seal} lang="ja" className="baren-seal font-seal">
        {copy.seal ?? "版"}
      </span>
    </div>
  );
}
