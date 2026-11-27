import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Fuda } from "@/components/fuda/Fuda";
import { Link } from "@/i18n/navigation";
import { orderNet } from "@/lib/market/buy-orders";
import { POSSESSION_PARAM, possessionValue, type Possession } from "@/lib/market/possession";
import { pushLater } from "@/server/market/queries";
import { myOrders, openOrdersBoard, ordersYouCanFill, type OrderWithCard } from "@/server/market/buy-order-queries";
import { expireDueWith } from "@/server/market/buy-order-core";
import { prisma } from "@/server/db";
import { ZeniCoin } from "../../layout/ZeniCoin";
import { possessionLabels, PossessionLinks } from "../PossessionFilter";
import { CancelOrder, SellToOrder } from "./OrderActions";

/** Une carte cherchée : fuda, prix offert, acheteur et échéance, plus le geste possible. */
function OrderTile({ order, action, expires, by }: { order: OrderWithCard; action?: ReactNode; expires: string; by: string }) {
  return (
    <li className="flex flex-col gap-2 lacquer rounded-card p-2">
      <Link href={`/wiki/${order.card.anilistId}`} className="block">
        <Fuda card={order.card} series={order.card.series} size="sm" />
      </Link>
      <div className="flex min-w-0 flex-col gap-0.5 px-0.5">
        <p className="truncate text-sm font-bold">{order.card.name}</p>
        <p className="flex items-center gap-1">
          <ZeniCoin size={14} />
          <span className="font-bold tabular-nums text-kin">{order.price}</span>
        </p>
        <p className="truncate text-xs text-text-muted">{by}</p>
        <p className="text-xs text-text-muted">{expires}</p>
      </div>
      {action && <div className="mt-auto flex justify-end">{action}</div>}
    </li>
  );
}

const grid = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6";

/**
 * Onglet « Avis de recherche » du marché : ce que les autres cherchent et que le joueur possède
 * (vente en un clic), ses propres avis, puis tous les avis ouverts.
 */
export async function OrdersTab({
  userId,
  guest,
  locale,
  sort,
  page,
  possession,
}: {
  userId: string;
  guest: boolean;
  locale: string;
  sort: "price" | "newest";
  page: number;
  possession: Possession;
}) {
  const now = new Date();
  // Ses avis échus rendent leurs Zeni dès qu'il les regarde, sans attendre le cron quotidien
  if (!guest) await expireDueWith(prisma, now, 20, pushLater, userId);
  const [t, tFilters, format, fillable, mine, board] = await Promise.all([
    getTranslations("market.orders"),
    getTranslations("market.filters"),
    getFormatter(),
    guest ? [] : ordersYouCanFill(userId, locale, now),
    guest ? null : myOrders(userId, locale, now),
    openOrdersBoard({ viewerId: userId, locale, rarity: null, possession, sort, page, now }),
  ]);
  const date = (d: Date) => format.dateTime(d, { day: "numeric", month: "short" });
  const by = (o: OrderWithCard) => t("byShort", { name: o.mine ? t("you") : (o.buyerName ?? t("someone")) });
  const href = (p: number, s: "price" | "newest", owned: string | null) =>
    `/marche?onglet=avis${s === "newest" ? "&tri=recent" : ""}${owned ? `&${POSSESSION_PARAM}=${owned}` : ""}${p > 0 ? `&page=${p}` : ""}`;
  const pageHref = (p: number, s = sort) => href(p, s, possessionValue(possession));

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-text-muted">{t("intro")}</p>

      {!guest && (
        <section aria-labelledby="orders-fill" className="flex flex-col gap-3">
          <h2 id="orders-fill" className="font-title text-xl font-bold">{t("fillTitle")}</h2>
          {fillable.length === 0 ? (
            <p className="text-sm text-text-muted">{t("fillEmpty")}</p>
          ) : (
            <ul className={grid}>
              {fillable.map((o) => (
                <OrderTile key={o.id} order={o} by={by(o)} expires={t("until", { date: date(o.expiresAt) })} action={<SellToOrder orderId={o.id} price={o.price} net={orderNet(o.price, o.feeBp)} />} />
              ))}
            </ul>
          )}
        </section>
      )}

      {mine && (
        <section aria-labelledby="orders-mine" className="flex flex-col gap-3">
          <h2 id="orders-mine" className="font-title text-xl font-bold">{t("mineTitle")}</h2>
          {mine.open.length === 0 ? (
            <p className="text-sm text-text-muted">{t("mineEmpty")}</p>
          ) : (
            <ul className={grid}>
              {mine.open.map((o) => (
                <OrderTile key={o.id} order={o} by={t("you")} expires={t("until", { date: date(o.expiresAt) })} action={<CancelOrder orderId={o.id} />} />
              ))}
            </ul>
          )}
          {mine.closed.length > 0 && (
            <details className="text-sm">
              <summary className="min-h-11 cursor-pointer content-center text-text-muted">{t("history", { count: mine.closed.length })}</summary>
              <ul className="mt-2 flex flex-col divide-y divide-border lacquer rounded-card">
                {mine.closed.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 p-3">
                    <Link href={`/wiki/${o.card.anilistId}`} className="min-w-0 truncate underline-offset-4 hover:underline">{o.card.name}</Link>
                    <span className="shrink-0 text-xs text-text-muted">
                      {t("zeni", { amount: o.price })} · {t(`status.${o.status}`)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      <section aria-labelledby="orders-all" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h2 id="orders-all" className="font-title text-xl font-bold">{t("allTitle")}</h2>
          <nav aria-label={t("sortLabel")} className="flex gap-3 text-sm">
            {(["price", "newest"] as const).map((s) => (
              <Link key={s} href={pageHref(0, s)} aria-current={sort === s ? "page" : undefined} className={`inline-flex min-h-11 items-center underline-offset-4 ${sort === s ? "font-bold text-text" : "text-link underline"}`}>
                {t(`sort.${s}`)}
              </Link>
            ))}
          </nav>
        </div>
        <PossessionLinks
          value={possession}
          label={tFilters("possession.label")}
          labels={possessionLabels(tFilters)}
          href={(owned) => href(0, sort, owned)}
        />
        {board.items.length === 0 ? (
          <p className="text-sm text-text-muted">{t("allEmpty")}</p>
        ) : (
          <ul className={grid}>
            {board.items.map((o) => (
              <OrderTile key={o.id} order={o} by={by(o)} expires={t("until", { date: date(o.expiresAt) })} />
            ))}
          </ul>
        )}
        {(page > 0 || board.hasMore) && (
          <nav aria-label={t("pagesLabel")} className="flex justify-between text-sm">
            {page > 0 ? <Link href={pageHref(page - 1)} className="inline-flex min-h-11 items-center text-link underline">{t("previous")}</Link> : <span />}
            {board.hasMore && <Link href={pageHref(page + 1)} className="inline-flex min-h-11 items-center text-link underline">{t("next")}</Link>}
          </nav>
        )}
      </section>
    </div>
  );
}
