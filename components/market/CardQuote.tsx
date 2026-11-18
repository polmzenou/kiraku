import { getFormatter, getTranslations } from "next-intl/server";
import { ZeniCoin } from "@/components/layout/ZeniCoin";
import { getCardPriceHistory } from "@/server/market/quotes";
import { PriceChart } from "./PriceChart";

/**
 * Cote d'une carte (fiche wiki et fiche de collection) : médiane des ventes aux enchères récentes,
 * tendance par rapport à la période précédente et courbe des ventes. Rendue sous Suspense : les cotes
 * changent avec le marché, la fiche autour reste en cache.
 */
export async function CardQuote({ cardId, headingLevel = 2 }: { cardId: string; headingLevel?: 2 | 3 }) {
  const [history, t, format] = await Promise.all([getCardPriceHistory(cardId), getTranslations("market.quote"), getFormatter()]);
  const { quote, rules, series, historyDays } = history;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const titleId = `quote-${cardId}`;
  const change = quote.changeBp === null ? null : quote.changeBp / 10_000;
  const changeText = change === null ? null : format.number(change, { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" });
  const summary = quote.price === null
    ? t("summaryNone", { sales: quote.sales, min: rules.minSales, days: rules.windowDays })
    : t("summary", { amount: quote.price, sales: quote.sales, days: rules.windowDays, change: changeText ?? "", hasChange: changeText === null ? "no" : "yes" });

  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-3 lacquer rounded-card p-4 md:p-5">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <Heading id={titleId} className="text-xs font-bold uppercase tracking-[0.18em] text-text-muted">{t("title")}</Heading>
          {quote.price === null ? (
            <p className="text-sm text-text-muted">{t("none", { sales: quote.sales, min: rules.minSales, days: rules.windowDays })}</p>
          ) : (
            <p className="flex items-center gap-2">
              <ZeniCoin size={22} />
              <span className="text-3xl font-extrabold tabular-nums">{format.number(quote.price)}</span>
              {change !== null && (
                <span className={`inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-xs font-bold tabular-nums ${change > 0 ? "border-hisui/50 text-hisui" : change < 0 ? "border-shu/50 text-shu" : "border-border text-text-muted"}`}>
                  <span aria-hidden="true">{change > 0 ? "▲" : change < 0 ? "▼" : "＝"}</span>
                  {changeText === null || change === 0 ? t("stable") : changeText}
                </span>
              )}
            </p>
          )}
        </div>
        {quote.price !== null && (
          <p className="text-xs text-text-muted">{t("basis", { sales: quote.sales, days: rules.windowDays })}</p>
        )}
      </div>

      {series.sales.length > 0 ? (
        <PriceChart days={series.days} sales={series.sales} historyDays={historyDays} now={new Date().toISOString()} summary={summary} />
      ) : (
        <p className="text-sm text-text-muted">{t("noSales", { days: historyDays })}</p>
      )}
      <p className="text-xs text-text-muted">{t("method")}</p>
    </section>
  );
}

/** Place réservée pendant le chargement de la cote. */
export function CardQuoteSkeleton() {
  return <div aria-hidden="true" className="h-64 animate-pulse lacquer rounded-card motion-reduce:animate-none" />;
}
