"use client";

import { useEffect, useId, useRef, useState } from "react";
import { primeAudio, vibrate } from "@/lib/sound/synth";

const HOLD_MS = 750;

/**
 * Validation « à la japonaise » : on maintient le bouton le temps que le pinceau le remplisse (doigt, souris ou
 * clavier, espace ou entrée). Évite une action irréversible par erreur (départ d'une expédition, renaissance,
 * consécration). Mouvement réduit : un appui arme le bouton, un second confirme.
 */
export function HoldButton({
  label,
  kanji,
  pendingLabel,
  confirmLabel,
  hint,
  disabled,
  pending,
  reduced,
  onHold,
}: {
  label: string;
  /** Sceau posé devant le texte (出発, 転生, 奉納). */
  kanji?: string;
  pendingLabel: string;
  /** Mouvement réduit : texte du second appui. */
  confirmLabel: string;
  /** Explication lue par les lecteurs d'écran (« Maintiens le bouton pour… »). */
  hint: string;
  disabled: boolean;
  pending: boolean;
  reduced: boolean;
  onHold: () => void;
}) {
  const [holding, setHolding] = useState(false);
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hintId = useId();
  const blocked = disabled || pending;

  useEffect(() => {
    if (!holding || blocked) return;
    timer.current = setTimeout(() => {
      setHolding(false);
      vibrate([18, 40, 30]);
      onHold();
    }, HOLD_MS);
    return () => clearTimeout(timer.current);
  }, [holding, blocked, onHold]);

  const start = () => {
    if (blocked) return;
    primeAudio();
    vibrate(10);
    setHolding(true);
  };
  const stop = () => setHolding(false);
  const seal = kanji ? (
    <span aria-hidden="true" lang="ja" className="font-seal text-lg">
      {kanji}
    </span>
  ) : null;

  if (reduced) {
    return (
      <button
        type="button"
        disabled={blocked}
        onClick={() => {
          if (!armed) return setArmed(true);
          setArmed(false);
          onHold();
        }}
        onBlur={() => setArmed(false)}
        className="relative flex min-h-14 w-full items-center justify-center gap-2 rounded-pill bg-shu-btn px-5 font-bold text-washi-paper shadow-shu disabled:opacity-50"
      >
        {seal}
        {pending ? pendingLabel : armed ? confirmLabel : label}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={blocked}
      aria-describedby={hintId}
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
        {seal}
        {pending ? pendingLabel : label}
      </span>
      <span id={hintId} className="sr-only">
        {hint}
      </span>
    </button>
  );
}
