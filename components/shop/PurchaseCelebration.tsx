"use client";

import { domAnimation, LazyMotion, m } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { BoosterArt } from "../boosters/BoosterArt";
import { ZeniCoin } from "../layout/ZeniCoin";
import { useFxLevel } from "../motion/MotionPreference";
import { useRitualFx } from "../opening/useRitualFx";
import { SealMark } from "../SealMark";
import { Button } from "../ui/Button";
import { ButtonLink } from "../ui/ButtonLink";
import type { Celebration } from "./ShopStage";

/** Sachets dessinés au plus : au-delà, un « ×N » (le pack ×10 doit tenir en 375 px). */
const MAX_SHOWN = 5;
/** Déroulé (ms) : éventail, sceau, texte, boutons. Piloté par setTimeout, jamais par la fin d'une animation. */
const TIMELINE = { fan: 120, stamp: 560, text: 780, actions: 1050 };
const TIMELINE_REDUCED = { fan: 0, stamp: 0, text: 0, actions: 150 };

/** Place d'un sachet dans l'éventail, déterministe : rotation et décalages (en % de sa largeur). */
function fanSlot(i: number, n: number) {
  const k = i - (n - 1) / 2;
  return { rotate: k * 13, x: `${k * 62}%`, y: `${Math.abs(k) * 7}%` };
}

/** Paillettes d'or en couronne autour du sceau (positions calculées, pas de hasard au rendu). */
function flakeVars(n: number): CSSProperties[] {
  return Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * Math.PI * 2 + 0.35;
    const radius = 110 + ((i * 37) % 60);
    return {
      "--dx": `${(Math.cos(angle) * radius).toFixed(1)}px`,
      "--dy": `${(Math.sin(angle) * radius * 0.8 - 20).toFixed(1)}px`,
      "--r": `${180 + ((i * 53) % 300)}deg`,
      "--s": `${6 + (i % 4)}px`,
      "--d": `${(i % 5) * 0.03}s`,
    } as CSSProperties;
  });
}

/**
 * Célébration d'un achat de boosters, dans un <dialog> natif (focus piégé, Échap, et la modale
 * d'annonce attend qu'il soit fermé). Le fond s'assombrit dans la couleur du type, les sachets jaillissent
 * en éventail, le sceau 済 s'abat dans un éclat d'or, puis viennent le résumé et « Ouvrir maintenant ».
 * Les particules restent dans le dialog : en dehors, sa couche supérieure les cacherait. Mouvement
 * réduit : fondus seulement ; effets allégés : moitié moins de paillettes.
 */
export function PurchaseCelebration({ reward, coins, spent, look, name, openHref, onClose }: Celebration & { onClose: () => void }) {
  const t = useTranslations("economy.shop.celebration");
  const ts = useTranslations("economy.shop");
  const level = useFxLevel();
  const reduced = level === "reduced";
  const fx = useRitualFx();
  const play = useRef(fx.play);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const actions = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const titleId = useId();
  const descId = useId();
  // Solde avant l'achat (le lot a pu rendre des Zeni) : il défile jusqu'au solde renvoyé par le serveur
  const before = coins + spent - reward.zeni;
  const [balance, setBalance] = useState(before);
  const counting = step >= 3;

  useEffect(() => {
    play.current = fx.play;
  });

  useEffect(() => {
    dialog.current?.showModal();
    title.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const at = reduced ? TIMELINE_REDUCED : TIMELINE;
    const timers = [
      setTimeout(() => setStep(1), at.fan),
      setTimeout(() => {
        setStep(2);
        play.current("stamp", 40);
      }, at.stamp),
      setTimeout(() => setStep(3), at.text),
      setTimeout(() => setStep(4), at.actions),
    ];
    return () => timers.forEach(clearTimeout);
  }, [reduced]);

  useEffect(() => {
    if (!counting) return;
    const start = performance.now();
    const duration = reduced ? 0 : 650;
    let frame = requestAnimationFrame(function tick(at) {
      const p = duration === 0 ? 1 : Math.min(1, Math.max(0, (at - start) / duration));
      setBalance(Math.round(before + (coins - before) * (1 - (1 - p) ** 3)));
      if (p < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [counting, reduced, before, coins]);

  // Les boutons arrivent en dernier : le focus passe du titre au premier d'entre eux
  useEffect(() => {
    if (step === 4 && document.activeElement === title.current) {
      actions.current?.querySelector<HTMLElement>("a, button")?.focus({ preventScroll: true });
    }
  }, [step]);

  if (!look) return null;
  const shown = Math.min(MAX_SHOWN, Math.max(1, reward.boosters));
  const spring = { type: "spring" as const, stiffness: 260, damping: 20 };

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-describedby={descId}
      onClose={onClose}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden bg-transparent p-0 text-washi-paper backdrop:bg-black/85"
    >
      <LazyMotion features={domAnimation} strict>
        {/* Lueur à la couleur du type */}
        <m.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(circle at 50% 38%, ${look.theme.base} 0%, transparent 62%)` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: step >= 1 ? 0.6 : 0.2 }}
          transition={{ duration: reduced ? 0 : 0.5 }}
        />

        <div className="relative flex h-full flex-col items-center justify-center gap-6 px-6 pt-[env(safe-area-inset-top)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div aria-hidden="true" className="relative h-[min(58vw,260px)] w-[min(90vw,460px)]">
            {/* Éclat d'or au moment du sceau */}
            {step >= 2 && !reduced && (
              <div className="pointer-events-none absolute inset-0">
                <span className="absolute top-[40%] left-1/2 size-44 -translate-1/2">
                  {[0, 0.12, 0.24].map((d) => (
                    <span key={d} className="fx-ring" style={{ "--ring": "#d9b556", "--d": `${d}s` } as CSSProperties} />
                  ))}
                </span>
                {flakeVars(level === "lite" ? 8 : 18).map((style, i) => (
                  <span key={i} className="fx-flake" style={style} />
                ))}
              </div>
            )}

            {Array.from({ length: shown }, (_, i) => {
              const slot = fanSlot(i, shown);
              return (
                <m.div
                  key={i}
                  className="absolute bottom-[6%] left-1/2 w-[21%] -translate-x-1/2"
                  style={{ transformOrigin: "50% 115%", zIndex: shown - Math.abs(Math.round(i - (shown - 1) / 2)) }}
                  initial={reduced ? { opacity: 0 } : { opacity: 0, y: "45%", scale: 0.55, rotate: 0 }}
                  animate={
                    step >= 1
                      ? reduced
                        ? { opacity: 1 }
                        : { opacity: 1, x: slot.x, y: slot.y, scale: 1, rotate: slot.rotate }
                      : reduced
                        ? { opacity: 0 }
                        : { opacity: 0, y: "45%", scale: 0.55, rotate: 0 }
                  }
                  transition={reduced ? { duration: 0.15 } : { ...spring, delay: i * 0.06 }}
                >
                  <BoosterArt shape={look.shape} theme={look.theme} emblem={look.emblem} name={name} contents={look.contents} compact flatShadow />
                </m.div>
              );
            })}

            {reward.boosters > MAX_SHOWN && (
              <span className="absolute right-[6%] bottom-[2%] rounded-pill bg-kin px-2.5 py-1 text-sm font-bold text-sumi tabular-nums">
                {ts("quantity", { count: reward.boosters })}
              </span>
            )}

            {/* Sceau 済 : réglé */}
            <m.span
              className="absolute top-[40%] left-1/2 z-20 -translate-1/2"
              initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 2.2, rotate: -28 }}
              animate={
                step >= 2
                  ? reduced
                    ? { opacity: 1 }
                    : { opacity: 1, scale: 1, rotate: -12 }
                  : reduced
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 2.2, rotate: -28 }
              }
              transition={reduced ? { duration: 0.15 } : { type: "spring", stiffness: 520, damping: 18 }}
            >
              <SealMark glyphs="済" size={76} />
            </m.span>
          </div>

          <m.div
            className="flex flex-col items-center gap-2 text-center"
            initial={false}
            animate={{ opacity: step >= 3 ? 1 : 0, y: step >= 3 || reduced ? 0 : 10 }}
            transition={{ duration: reduced ? 0.15 : 0.3 }}
          >
            <h2 ref={title} id={titleId} tabIndex={-1} className="font-heading text-2xl outline-none sm:text-3xl">
              {t("title")}
            </h2>
            <p id={descId} className="text-base font-bold text-kin">
              {t("boosters", { count: reward.boosters, name })}
            </p>
            <p className="flex flex-wrap items-center justify-center gap-x-2 text-sm text-washi-paper/75 tabular-nums">
              <span>{t("spent", { amount: spent })}</span>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-1.5">
                <ZeniCoin size={14} />
                <span className="sr-only">{t("balance", { amount: coins })}</span>
                <span aria-hidden="true">{t("balance", { amount: balance })}</span>
              </span>
            </p>
          </m.div>

          <m.div
            ref={actions}
            className="flex flex-wrap justify-center gap-2"
            initial={false}
            animate={{ opacity: step >= 4 ? 1 : 0, y: step >= 4 || reduced ? 0 : 8 }}
            transition={{ duration: reduced ? 0.15 : 0.3 }}
            inert={step < 4}
          >
            {openHref && (
              <ButtonLink href={openHref} variant="primary" size="lg">
                {t("open")}
              </ButtonLink>
            )}
            <Button type="button" size="lg" onClick={() => dialog.current?.close()}>
              {t("continue")}
            </Button>
          </m.div>
        </div>
      </LazyMotion>
    </dialog>
  );
}
