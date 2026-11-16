"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { primeAudio, vibrate } from "@/lib/sound/synth";

const HOLD_MS = 750;

/**
 * Départ « à la japonaise » : on maintient le bouton le temps que le pinceau le remplisse (doigt, souris
 * ou clavier, espace ou entrée). Évite un départ par erreur. Mouvement réduit : un appui arme le bouton,
 * un second confirme.
 */
export function HoldToLaunch({ label, disabled, pending, reduced, onLaunch }: { label: string; disabled: boolean; pending: boolean; reduced: boolean; onLaunch: () => void }) {
  const t = useTranslations("expedition.team");
  const [holding, setHolding] = useState(false);
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const blocked = disabled || pending;

  useEffect(() => {
    if (!holding || blocked) return;
    timer.current = setTimeout(() => {
      setHolding(false);
      vibrate([18, 40, 30]);
      onLaunch();
    }, HOLD_MS);
    return () => clearTimeout(timer.current);
  }, [holding, blocked, onLaunch]);

  const start = () => {
    if (blocked) return;
    primeAudio();
    vibrate(10);
    setHolding(true);
  };
  const stop = () => setHolding(false);

  if (reduced) {
    return (
      <button
        type="button"
        disabled={blocked}
        onClick={() => {
          if (!armed) return setArmed(true);
          setArmed(false);
          onLaunch();
        }}
        onBlur={() => setArmed(false)}
        className="relative min-h-14 w-full rounded-pill bg-shu-btn px-5 font-bold text-washi-paper shadow-shu disabled:opacity-50"
      >
        {pending ? t("launching") : armed ? t("confirmLaunch") : label}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={blocked}
      aria-describedby="exp-hold-hint"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start();
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") stop();
      }}
      onContextMenu={(e) => e.preventDefault()}
      className="relative min-h-14 w-full touch-none overflow-hidden rounded-pill bg-shu-btn/70 px-5 font-bold text-washi-paper shadow-shu select-none disabled:opacity-50 [-webkit-touch-callout:none]"
    >
      {/* Pinceau qui remplit le bouton : scaleX seulement */}
      <span
        aria-hidden="true"
        className="absolute inset-0 origin-left bg-shu-btn"
        style={{
          transform: `scaleX(${holding ? 1 : 0})`,
          transition: holding ? `transform ${HOLD_MS}ms cubic-bezier(.3,.1,.3,1)` : "transform 200ms ease-out",
        }}
      />
      <span className="relative flex items-center justify-center gap-2">
        <span aria-hidden="true" lang="ja" className="font-seal text-lg">
          出発
        </span>
        {pending ? t("launching") : label}
      </span>
      <span id="exp-hold-hint" className="sr-only">
        {t("holdHint")}
      </span>
    </button>
  );
}
