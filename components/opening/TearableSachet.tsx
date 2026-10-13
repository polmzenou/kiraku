"use client";

import { animate, m, useMotionValue } from "motion/react";
import { useTranslations } from "next-intl";
import { useRef, useState, type PointerEvent } from "react";
import type { SachetTheme } from "@/lib/boosters/catalog";
import { Sachet } from "../boosters/Sachet";
import { Button } from "../ui/Button";

/** Part du geste à partir de laquelle l'ouverture est envoyée au serveur. */
const TRIGGER_AT = 0.3;

type Props = {
  theme: SachetTheme;
  name: string;
  tagline: string;
  contents: string;
  disabled: boolean;
  reduced: boolean;
  /** Nombre de sachets ouverts d'un coup (pile affichée derrière quand > 1). */
  count: number;
  /** Envoie l'ouverture au serveur : appelé une seule fois, dès 30 % du geste ou au bouton. */
  onTrigger: () => void;
  /** La bande s'est envolée : les cartes peuvent sortir. */
  onTorn: () => void;
};

/**
 * Sachet à déchirer : on glisse le doigt sur la bande du haut (geste horizontal limité à la bande,
 * la page continue de défiler verticalement). La déchirure suit le doigt ; l'appel serveur part
 * pendant le geste, et le tirage est déjà enregistré quand les cartes apparaissent.
 */
export function TearableSachet({ theme, name, tagline, contents, disabled, reduced, count, onTrigger, onTorn }: Props) {
  const t = useTranslations("opening");
  const progress = useMotionValue(0);
  const [torn, setTorn] = useState(false);
  const [busy, setBusy] = useState(false);
  const fired = useRef(false);
  const completing = useRef(false);
  const drag = useRef<{ id: number; startX: number; width: number } | null>(null);

  const fire = () => {
    if (fired.current || disabled) return;
    fired.current = true;
    onTrigger();
  };

  const complete = () => {
    if (completing.current) return;
    completing.current = true;
    setBusy(true);
    if (reduced) {
      setTorn(true);
      onTorn();
      return;
    }
    animate(progress, 1, { duration: 0.15 }).then(() => setTorn(true));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || completing.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, startX: e.clientX, width: e.currentTarget.getBoundingClientRect().width };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const p = Math.min(1, Math.abs(e.clientX - d.startX) / (d.width * 0.75));
    if (p > progress.get()) progress.set(p);
    if (p >= TRIGGER_AT) fire();
    if (p >= 1) complete();
  };

  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    // Une fois l'ouverture envoyée, on termine la déchirure ; sinon la bande revient en place
    if (fired.current) complete();
    else animate(progress, 0, { duration: 0.2 });
  };

  const tearWithButton = () => {
    fire();
    complete();
  };

  return (
    <div className="flex flex-col items-center gap-5">
      <div className={`relative w-[min(16rem,70vw)] ${disabled ? "opacity-50 grayscale" : ""}`}>
        {/* Pile de sachets derrière quand on en ouvre plusieurs */}
        {count > 1 && (
          <>
            <div aria-hidden="true" className="absolute inset-0 translate-x-3 translate-y-2 rotate-3 opacity-50">
              <Sachet theme={theme} name="" contents={contents} />
            </div>
            <div aria-hidden="true" className="absolute inset-0 translate-x-1.5 translate-y-1 rotate-[1.5deg] opacity-75">
              <Sachet theme={theme} name="" contents={contents} />
            </div>
          </>
        )}
        <div className="relative">
          <Sachet
            theme={theme}
            name={name}
            tagline={tagline}
            contents={contents}
            renderBand={(band) => (
              <m.div
                aria-hidden="true"
                className={`absolute inset-x-0 top-0 z-10 h-[13%] touch-pan-y ${disabled ? "" : "cursor-grab active:cursor-grabbing"}`}
                initial={false}
                animate={torn ? { y: "-160%", x: "18%", rotate: -14, opacity: 0 } : { y: 0, x: 0, rotate: 0, opacity: 1 }}
                transition={{ duration: 0.45, ease: "easeOut" }}
                onAnimationComplete={() => {
                  if (torn) onTorn();
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerEnd}
                onPointerCancel={onPointerEnd}
              >
                {band}
                <m.span
                  aria-hidden="true"
                  className="absolute inset-x-[4%] bottom-0 h-[3px] origin-left rounded-full bg-washi-paper shadow-[0_0_6px_rgb(255_255_255/0.8)]"
                  style={{ scaleX: progress }}
                />
              </m.div>
            )}
          />
        </div>
        {count > 1 && (
          <span className="absolute -top-2 -right-2 z-20 rounded-full bg-shu-btn px-2.5 py-1 text-sm font-bold text-washi-paper shadow-paper">
            {t("times", { n: count })}
          </span>
        )}
      </div>

      <p className="text-center text-sm text-text-muted">{reduced ? t("hintReduced") : t("hint")}</p>
      <Button variant="shu" onClick={tearWithButton} disabled={disabled || busy} className="min-w-40">
        {t("tear")}
      </Button>
    </div>
  );
}
