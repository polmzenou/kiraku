import Image from "next/image";
import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Rarity } from "@/lib/catalog/rarity";
import { getSetting } from "@/server/settings";
import { getTopMovers } from "@/server/market/quotes";
import { spoilerImageAttrs } from "@/lib/spoiler";

/**
 * « Plus fortes hausses » du marché : cartes dont la cote monte le plus par rapport à la période
 * précédente. Masquée tant qu'aucune carte n'a de tendance (marché calme ou trop jeune).
 */
export async function TopMovers() {
  const [movers, t, tRarity, format, windowDays] = await Promise.all([
    getTopMovers(6),
    getTranslations("market.quote"),
    getTranslations("rarity"),
    getFormatter(),
    getSetting("market.quoteWindowDays"),
  ]);
  if (movers.length === 0) return null;

  return (
    <section aria-labelledby="market-movers-title" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="market-movers-title" className="font-title text-xl font-bold">{t("moversTitle")}</h2>
        <p className="text-xs text-text-muted">{t("moversHint", { days: windowDays })}</p>
      </div>
      <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 xl:grid-cols-6">
        {movers.map(({ card, price, changeBp, sales }) => {
          const change = format.number(changeBp / 10_000, { style: "percent", maximumFractionDigits: 1, signDisplay: "always" });
          const name = [card.name, card.formName].filter(Boolean).join(" · ");
          return (
            <li key={card.anilistId} className="w-44 shrink-0 snap-start md:w-auto">
              <Link
                href={`/wiki/${card.anilistId}`}
                aria-label={t("moverLabel", { name, rarity: tRarity(card.rarity as Rarity), amount: price, change, sales })}
                className="flex h-full items-center gap-3 lacquer rounded-card p-3 transition-colors hover:bg-surface-2"
              >
                <div aria-hidden="true" className="relative aspect-[5/7] w-12 shrink-0 overflow-hidden rounded-md border border-border bg-surface-2">
                  <Image src={card.imageUrl} alt="" fill sizes="48px" className="object-cover object-top" {...spoilerImageAttrs(card.spoiler, card.spoilerKey)} />
                </div>
                <div aria-hidden="true" className="flex min-w-0 flex-col gap-0.5">
                  <p className="truncate text-sm font-bold">{name}</p>
                  <p className="text-[11px] text-text-muted">{tRarity(card.rarity as Rarity)}</p>
                  <p className="text-sm font-bold tabular-nums">{t("zeni", { amount: price })}</p>
                  <p className="inline-flex items-center gap-1 text-xs font-bold tabular-nums text-hisui">
                    <span>▲</span>
                    {change}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
