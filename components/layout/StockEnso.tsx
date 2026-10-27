"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { computeStock } from "@/lib/boosters/stock";
import { useClock, useFormatCountdown } from "../boosters/useBoosterClock";

type Props = { stock: number; max: number; nextAt: number | null; intervalMs: number; serverNow: number };

/**
 * Stock de boosters : un ensō (円相) qui se referme pendant le délai, suivi de « 7/10 ».
 * Il occupe la moitié gauche de la capsule de statut de l'en-tête.
 * L'anneau est fait de deux demi-cercles qui tournent : uniquement des transform.
 * Le stock affiché avance seul, par le même calcul que le serveur (computeStock) : pas de nouveau
 * rendu serveur à chaque booster regagné. Le serveur reste seul juge à l'ouverture.
 */
export function StockEnso({ stock: renderedStock, max, nextAt: renderedNextAt, intervalMs, serverNow }: Props) {
  const t = useTranslations("header");
  const format = useFormatCountdown();
  const now = useClock(serverNow);
  const projected =
    renderedNextAt === null ? null : computeStock(renderedStock, new Date(renderedNextAt - intervalMs), new Date(now), { max, intervalMs });
  const stock = projected?.stock ?? renderedStock;
  const nextAt = projected ? (projected.nextAt?.getTime() ?? null) : renderedNextAt;
  const remaining = nextAt === null ? null : Math.max(0, nextAt - now);
  const full = remaining === null;
  const progress = full ? 1 : 1 - Math.min(1, remaining / intervalMs);
  const first = Math.min(progress, 0.5) * 360;
  const second = Math.max(progress - 0.5, 0) * 360;
  const label = `${t("stock", { count: stock, max })}. ${full ? t("full") : t("nextIn", { time: format(remaining) })}`;

  return (
    <Link prefetch={false}
      href="/"
      aria-label={label}
      title={label}
      className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-l-pill pr-2.5 pl-3 text-sm font-bold tabular-nums"
    >
      <span aria-hidden="true" className="relative size-[18px] shrink-0 md:size-[22px]">
        <span className="absolute inset-0 rounded-full border-[3px] border-border" />
        {/* Moitié droite : les 180 premiers degrés */}
        <span className="absolute inset-0 [clip-path:inset(0_0_0_50%)]">
          <span
            className={`absolute inset-0 rounded-full border-[3px] [clip-path:inset(0_50%_0_0)] ${full ? "border-kin" : "border-shu"}`}
            style={{ transform: `rotate(${first}deg)` }}
          />
        </span>
        {/* Moitié gauche : les 180 suivants */}
        <span className="absolute inset-0 [clip-path:inset(0_50%_0_0)]">
          <span
            className={`absolute inset-0 rounded-full border-[3px] [clip-path:inset(0_0_0_50%)] ${full ? "border-kin" : "border-shu"}`}
            style={{ transform: `rotate(${second}deg)` }}
          />
        </span>
      </span>
      <span aria-hidden="true">
        {stock}/{max}
      </span>
    </Link>
  );
}
