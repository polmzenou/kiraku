"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

/** Secondes restantes avant `endsAt`, rafraîchies toutes les 250 ms ; `skew` = horloge serveur − horloge locale. */
export function useSecondsLeft(endsAt: string | null, skew: number): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);
  if (!endsAt) return null;
  return Math.max(0, (new Date(endsAt).getTime() - (now + skew)) / 1_000);
}

/**
 * Minuteur du tour : un ensō qui se referme (deux demi-anneaux qui tournent, comme le stock de
 * boosters : uniquement des transform). Rouge vermillon dans les 10 dernières secondes.
 */
export function TurnTimer({ secondsLeft, total }: { secondsLeft: number | null; total: number }) {
  const t = useTranslations("battle.board");
  if (secondsLeft === null) return <span className="size-11" aria-hidden="true" />;
  const progress = 1 - Math.min(1, secondsLeft / total);
  const first = Math.min(progress, 0.5) * 360;
  const second = Math.max(progress - 0.5, 0) * 360;
  const urgent = secondsLeft <= 10;
  const color = urgent ? "border-shu" : "border-kin";
  const seconds = Math.ceil(secondsLeft);
  return (
    <span role="timer" aria-label={t("timer", { seconds })} className="relative inline-flex size-11 shrink-0 items-center justify-center">
      <span aria-hidden="true" className="absolute inset-[3px] rounded-full border-[3px] border-border" />
      <span aria-hidden="true" className="absolute inset-[3px] [clip-path:inset(0_0_0_50%)]">
        <span className={`absolute inset-0 rounded-full border-[3px] [clip-path:inset(0_50%_0_0)] ${color}`} style={{ transform: `rotate(${first}deg)` }} />
      </span>
      <span aria-hidden="true" className="absolute inset-[3px] [clip-path:inset(0_50%_0_0)]">
        <span className={`absolute inset-0 rounded-full border-[3px] [clip-path:inset(0_0_0_50%)] ${color}`} style={{ transform: `rotate(${second}deg)` }} />
      </span>
      <span aria-hidden="true" className={`relative text-xs font-bold tabular-nums ${urgent ? "text-shu" : ""}`}>
        {seconds}
      </span>
    </span>
  );
}
