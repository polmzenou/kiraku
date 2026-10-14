"use client";

import { useTranslations } from "next-intl";
import { useBoosterCountdown, useFormatCountdown } from "./useBoosterClock";

/** « Prochain sachet gratuit dans 8 min 15 s », ou rien à attendre quand le stock est plein. */
export function NextFreeIn({ nextAt, serverNow, className = "" }: { nextAt: number | null; serverNow: number; className?: string }) {
  const t = useTranslations("boosters");
  const format = useFormatCountdown();
  const remaining = useBoosterCountdown(nextAt, serverNow);
  return (
    <p className={`text-xs text-text-muted ${className}`} aria-live="off">
      {remaining === null ? t("stockFull") : t("nextFree", { time: format(remaining) })}
    </p>
  );
}
