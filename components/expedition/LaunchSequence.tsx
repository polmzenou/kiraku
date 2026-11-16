"use client";

import { domAnimation, LazyMotion, m } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { CardBack } from "@/components/fuda/CardBack";
import { Fuda } from "@/components/fuda/Fuda";
import type { CardView } from "@/lib/boosters/view";
import { playSound, vibrate } from "@/lib/sound/synth";

type Phase = "gather" | "seal" | "stamp" | "depart";

/** Calendrier de la séquence (ms depuis l'ouverture). */
const AT = { seal: 650, stamp: 1250, depart: 1900, done: 2900 } as const;

/**
 * Départ d'une expédition, plein écran (chargé à la demande) : les trois fuda arrivent en éventail,
 * se retournent et s'empilent, une bande de washi les noue, le sceau 遠征 s'abat dans une éclaboussure
 * d'encre, puis le paquet file vers l'horizon entre les bandes de brume. Un appui passe la séquence.
 * Mouvement réduit : le sceau apparaît en fondu, puis tout se referme.
 */
export function LaunchSequence({ cards, name, reduced, onDone }: { cards: CardView[]; name: string; reduced: boolean; onDone: () => void }) {
  const t = useTranslations("expedition.launch");
  const dialog = useRef<HTMLDialogElement>(null);
  const [phase, setPhase] = useState<Phase>(reduced ? "stamp" : "gather");
  const done = useRef(false);
  const finish = useRef(onDone);
  useEffect(() => {
    finish.current = onDone;
  }, [onDone]);

  useEffect(() => {
    dialog.current?.showModal();
    const close = () => {
      if (done.current) return;
      done.current = true;
      finish.current();
    };
    if (reduced) {
      const id = setTimeout(close, 1100);
      return () => clearTimeout(id);
    }
    playSound("whoosh", 0.4);
    const timers = [
      setTimeout(() => {
        setPhase("seal");
        playSound("flip", 0.5);
      }, AT.seal),
      setTimeout(() => {
        setPhase("stamp");
        playSound("stamp", 0.8);
        vibrate(35);
      }, AT.stamp),
      setTimeout(() => {
        setPhase("depart");
        playSound("whoosh", 0.5);
      }, AT.depart),
      setTimeout(close, AT.done),
    ];
    return () => timers.forEach(clearTimeout);
  }, [reduced]);

  const skip = () => {
    if (done.current) return;
    done.current = true;
    finish.current();
  };

  const stacked = phase !== "gather";
  const stamped = phase === "stamp" || phase === "depart";
  const away = phase === "depart";

  return (
    <dialog
      ref={dialog}
      aria-label={t("label", { name })}
      onCancel={(e) => {
        e.preventDefault();
        skip();
      }}
      onClick={skip}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden bg-transparent p-0 text-washi-paper backdrop:bg-[#0b0a12]/90"
    >
      <LazyMotion features={domAnimation} strict>
        {/* Bandes de brume qui se referment sur le départ */}
        {!reduced &&
          [0, 1, 2].map((i) => (
            <m.span
              key={i}
              aria-hidden="true"
              className="absolute h-10 w-[140vw] rounded-full bg-washi-paper/15 blur-sm"
              style={{ top: `${58 + i * 9}%`, left: "-20vw" }}
              initial={{ x: i % 2 ? "60vw" : "-60vw", opacity: 0 }}
              animate={away ? { x: 0, opacity: 0.9 } : { x: i % 2 ? "45vw" : "-45vw", opacity: 0.4 }}
              transition={{ duration: away ? 0.9 : 1.6, ease: "easeOut", delay: i * 0.08 }}
            />
          ))}

        <div className="relative flex h-full flex-col items-center justify-center gap-6 px-6">
          <m.div
            className="relative h-[min(52vw,230px)] w-[min(37vw,165px)]"
            initial={false}
            animate={away ? { x: "34vw", y: "-32vh", scale: 0.18, rotate: 18, opacity: 0 } : { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 }}
            transition={away ? { duration: 0.95, ease: [0.55, 0, 0.75, 0.2] } : { duration: 0.3 }}
          >
            {cards.map((card, i) => {
              const spread = (i - 1) * 1;
              return (
                <m.div
                  key={card.cardId}
                  className="absolute inset-0"
                  style={{ zIndex: 3 - Math.abs(i - 1) }}
                  initial={reduced ? false : { y: 160, opacity: 0, rotate: spread * 18 }}
                  animate={
                    stacked
                      ? { x: spread * 4, y: spread * -3, rotate: spread * 3, opacity: 1 }
                      : { x: spread * 92, y: Math.abs(spread) * 14, rotate: spread * 12, opacity: 1 }
                  }
                  transition={{ type: "spring", stiffness: 200, damping: 22, delay: stacked ? 0 : 0.07 * i }}
                >
                  {/* Retournement : la face s'efface sous le dos (opacité et rotation sur Y) */}
                  <m.div className="absolute inset-0" initial={false} animate={{ opacity: stacked ? 0 : 1, rotateY: stacked ? 90 : 0 }} transition={{ duration: 0.25 }}>
                    <Fuda card={card} series={card.series} size="md" still />
                  </m.div>
                  <m.div className="absolute inset-0" initial={false} animate={{ opacity: stacked ? 1 : 0, rotateY: stacked ? 0 : -90 }} transition={{ duration: 0.25, delay: stacked ? 0.2 : 0 }}>
                    <CardBack flat />
                  </m.div>
                </m.div>
              );
            })}

            {/* Bande de washi nouée autour de la pile */}
            <m.span
              aria-hidden="true"
              className="absolute top-[42%] -right-3 -left-3 z-10 h-[16%] origin-left rounded-sm bg-[linear-gradient(90deg,#efe4cf,#f8f1e3_40%,#e7dac0)] shadow-[0_2px_8px_rgb(0_0_0/0.35)]"
              initial={false}
              animate={{ scaleX: stacked ? 1 : 0, opacity: stacked ? 1 : 0 }}
              transition={{ duration: 0.35, delay: stacked ? 0.35 : 0, ease: "easeOut" }}
            />

            {/* Sceau 遠征 et éclaboussure d'encre */}
            <m.span
              aria-hidden="true"
              className="absolute top-1/2 left-1/2 z-20 -mt-12 -ml-12 size-24 rounded-full border-4 border-shu"
              initial={false}
              animate={stamped ? { scale: [0.6, 1.7], opacity: [0.7, 0] } : { scale: 0.6, opacity: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
            <m.span
              aria-hidden="true"
              lang="ja"
              className="absolute top-1/2 left-1/2 z-20 -mt-10 -ml-10 inline-flex size-20 items-center justify-center rounded-[12px] border-[3px] border-[#f6d8cf] bg-shu-btn font-seal text-2xl leading-none text-washi-paper shadow-[0_6px_24px_rgb(200_55_45/0.55)] [writing-mode:vertical-rl]"
              initial={reduced ? { opacity: 0 } : { scale: 1.9, opacity: 0, rotate: -14 }}
              animate={stamped ? { scale: 1, opacity: 1, rotate: -8 } : reduced ? { opacity: 0 } : { scale: 1.9, opacity: 0, rotate: -14 }}
              transition={reduced ? { duration: 0.3 } : { type: "spring", stiffness: 700, damping: 20 }}
            >
              遠征
            </m.span>
          </m.div>

          <m.p
            className="text-center font-title text-2xl font-extrabold"
            initial={{ opacity: 0, y: 10 }}
            animate={stamped ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            transition={{ duration: 0.4, delay: reduced ? 0 : 0.2 }}
            aria-live="polite"
          >
            {away || reduced ? t("departed") : t("sealed", { name })}
          </m.p>
          {!reduced && <span className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] text-xs text-washi-paper/60">{t("skip")}</span>}
        </div>
      </LazyMotion>
    </dialog>
  );
}
