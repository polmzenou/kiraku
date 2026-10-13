"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useBoosterCountdown, useFormatCountdown } from "../boosters/useBoosterClock";

type Props = { stock: number; max: number; nextAt: number | null; intervalMs: number; serverNow: number };

/**
 * Stock de boosters : un ensō (円相) qui se referme pendant le délai, « 7/10 » au centre.
 * L'anneau est fait de deux demi-cercles qui tournent : uniquement des transform.
 */
export function StockEnso({ stock, max, nextAt, intervalMs, serverNow }: Props) {
  const t = useTranslations("header");
  const format = useFormatCountdown();
  const remaining = useBoosterCountdown(nextAt, serverNow);
  const full = remaining === null;
  const progress = full ? 1 : 1 - Math.min(1, remaining / intervalMs);
  const first = Math.min(progress, 0.5) * 360;
  const second = Math.max(progress - 0.5, 0) * 360;
  const label = `${t("stock", { count: stock, max })}. ${full ? t("full") : t("nextIn", { time: format(remaining) })}`;

  return (
    <Link
      href="/boosters"
      aria-label={label}
      title={label}
      className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-full"
    >
      <span aria-hidden="true" className="absolute inset-[3px] rounded-full border-[3px] border-border" />
      {/* Moitié droite : les 180 premiers degrés */}
      <span aria-hidden="true" className="absolute inset-[3px] [clip-path:inset(0_0_0_50%)]">
        <span
          className={`absolute inset-0 rounded-full border-[3px] [clip-path:inset(0_50%_0_0)] ${full ? "border-kin" : "border-shu"}`}
          style={{ transform: `rotate(${first}deg)` }}
        />
      </span>
      {/* Moitié gauche : les 180 suivants */}
      <span aria-hidden="true" className="absolute inset-[3px] [clip-path:inset(0_50%_0_0)]">
        <span
          className={`absolute inset-0 rounded-full border-[3px] [clip-path:inset(0_0_0_50%)] ${full ? "border-kin" : "border-shu"}`}
          style={{ transform: `rotate(${second}deg)` }}
        />
      </span>
      <span aria-hidden="true" className="relative text-[10px] font-bold leading-none tabular-nums">
        {stock}/{max}
      </span>
    </Link>
  );
}
