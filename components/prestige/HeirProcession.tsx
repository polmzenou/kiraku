"use client";

import { useEffect, useRef, useState } from "react";
import { Fuda, type FudaCard } from "../fuda/Fuda";
import { useMarquee } from "../home/useMarquee";
import { useReducedFx } from "../motion/MotionPreference";

// En dessous, la procession tient dans le rouleau : pas de défilement automatique
const MARQUEE_MIN = 5;
const SECONDS_PER_CARD = 3;

/**
 * Procession des héritières d'un cycle, dans le rouleau déroulé : un ruban sans fin qui défile seul et qu'on fait
 * glisser du doigt, comme « Gros tirages » (même ruban, pause au survol, au focus et hors de l'écran). Rouleau fermé :
 * rien n'est monté. Sans animation, une rangée à faire défiler à la main.
 */
export function HeirProcession({ heirs, label }: { heirs: FudaCard[]; label: string }) {
  const reduced = useReducedFx();
  const marquee = heirs.length >= MARQUEE_MIN && !reduced;
  const box = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  // Rouleau (<details>) qui la porte : fermé, ses héritières ne sont pas montées et le ruban ne tourne pas
  const [open, setOpen] = useState(false);
  const { track, handlers } = useMarquee<HTMLDivElement>({ enabled: marquee, periodSeconds: heirs.length * SECONDS_PER_CARD, paused: !inView || !open });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const details = el.closest("details");
    const sync = () => setOpen(details ? details.open : true);
    const observer = new IntersectionObserver(([entry]) => {
      setInView(entry?.isIntersecting ?? false);
      sync();
    });
    observer.observe(el);
    details?.addEventListener("toggle", sync);
    return () => {
      observer.disconnect();
      details?.removeEventListener("toggle", sync);
    };
  }, []);

  // Chaque passage porte sa marge de fin : les deux moitiés de la piste ont exactement la même largeur
  const list = (copy: boolean) => (
    <ul className="flex gap-1.5 pr-1.5" aria-label={copy ? undefined : label}>
      {heirs.map((card, i) => (
        <li key={i} className="w-16 shrink-0">
          <Fuda card={card} size="sm" still describeImage={!copy} />
        </li>
      ))}
    </ul>
  );

  return (
    <div
      ref={box}
      {...(marquee ? handlers : {})}
      // Ruban glissable : le geste ne doit pas changer d'onglet
      data-swipe-ignore
      className={`-mx-1 px-1 py-0.5 ${marquee ? "cursor-grab touch-pan-y overflow-hidden select-none active:cursor-grabbing" : "overflow-x-auto [scrollbar-width:thin]"}`}
    >
      <div ref={track} className="flex w-max will-change-transform">
        {open && list(false)}
        {/* Deuxième passage pour la boucle : invisible aux lecteurs d'écran */}
        {open && marquee && (
          <div aria-hidden="true" className="flex">
            {list(true)}
          </div>
        )}
      </div>
    </div>
  );
}
