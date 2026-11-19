import { getFormatter, getTranslations } from "next-intl/server";
import { isFrozen } from "@/lib/account/deletion";
import { orderNet } from "@/lib/market/buy-orders";
import { priceCap } from "@/lib/market/rules";
import { cardOrders, getBuyOrderRules } from "@/server/market/buy-order-queries";
import { getMarketRules } from "@/server/market/queries";
import { getMarketQuotes } from "@/server/market/quotes";
import { getCurrentUser } from "@/server/user";
import { ZeniCoin } from "../../layout/ZeniCoin";
import { CancelOrder, PostOrderForm, SellToOrder } from "./OrderActions";

/**
 * Avis de recherche d'une carte (fiche wiki et fiche de collection) : meilleures offres, vente en un
 * clic pour qui possède un exemplaire libre, avis du visiteur et formulaire pour en publier un.
 * Personnel au lecteur : rendu sous Suspense, hors de la fiche mise en cache.
 */
export async function CardBuyOrders({ cardId, rarity, headingLevel = 2 }: { cardId: string; rarity: string; headingLevel?: 2 | 3 }) {
  const [user, market, rules] = await Promise.all([getCurrentUser(), getMarketRules(), getBuyOrderRules()]);
  if (!market.enabled || !rules.enabled) return null;
  const viewer = user && !user.bannedAt && !isFrozen(user) ? user : null;
  const [orders, quotes, t, format] = await Promise.all([
    cardOrders(cardId, viewer?.id ?? null),
    getMarketQuotes(),
    getTranslations("market.orders"),
    getFormatter(),
  ]);
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const titleId = `orders-${cardId}`;
  const canSell = viewer !== null && !viewer.isGuest && orders.freeCopies > 0;
  const quote = quotes.byCard[cardId]?.price ?? null;
  const max = priceCap(market, rarity);
  const expires = (d: Date) => format.dateTime(d, { day: "numeric", month: "short" });

  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-3 lacquer rounded-card p-4 md:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <Heading id={titleId} className="text-xs font-bold uppercase tracking-[0.18em] text-text-muted">{t("title")}</Heading>
        {orders.total > 0 && <p className="text-xs text-text-muted">{t("count", { count: orders.total })}</p>}
      </div>

      {orders.best.length === 0 ? (
        <p className="text-sm text-text-muted">{t("none")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {orders.best.map((o, i) => (
            <li key={o.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <div className="flex min-w-0 flex-col">
                <p className="flex items-center gap-1.5">
                  <ZeniCoin size={16} />
                  <span className="text-lg font-bold tabular-nums">{format.number(o.price)}</span>
                </p>
                <p className="truncate text-xs text-text-muted">{t("by", { name: o.buyerName ?? t("someone"), date: expires(o.expiresAt) })}</p>
              </div>
              {/* La meilleure offre en bouton principal, les suivantes en retrait */}
              {canSell && <SellToOrder orderId={o.id} price={o.price} net={orderNet(o.price, o.feeBp)} primary={i === 0} />}
            </li>
          ))}
        </ul>
      )}
      {viewer && !viewer.isGuest && orders.best.length > 0 && orders.freeCopies === 0 && <p className="text-xs text-text-muted">{t("noCopy")}</p>}

      {orders.mine.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <p className="text-sm font-bold">{t("yours")}</p>
          <ul className="flex flex-col gap-2">
            {orders.mine.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3">
                <p className="text-sm">
                  <span className="font-bold tabular-nums">{t("zeni", { amount: o.price })}</span>
                  <span className="text-text-muted"> · {t("until", { date: expires(o.expiresAt) })}</span>
                </p>
                <CancelOrder orderId={o.id} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        {viewer && !viewer.isGuest ? (
          <PostOrderForm cardId={cardId} suggested={quote ?? market.minStartPrice} min={market.minStartPrice} max={max} coins={viewer.coins} days={rules.durationDays} />
        ) : (
          <p className="text-sm text-text-muted">{t("guest")}</p>
        )}
        <p className="text-xs text-text-muted">{t("how")}</p>
      </div>
    </section>
  );
}

/** Place réservée pendant le chargement des avis. */
export function CardBuyOrdersSkeleton() {
  return <div aria-hidden="true" className="h-48 animate-pulse lacquer rounded-card motion-reduce:animate-none" />;
}
