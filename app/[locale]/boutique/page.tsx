import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { BuyButton } from "@/components/economy/BuyButton";
import { LotRewards } from "@/components/economy/LotRewards";
import { LotStage } from "@/components/economy/LotStage";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { ZeniCoin } from "@/components/layout/ZeniCoin";
import { PageShell } from "@/components/PageShell";
import { SectionTitle } from "@/components/SectionTitle";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { localize, parseLocalized } from "@/lib/boosters/types";
import { limitPeriodKey, onSaleForZeni, remainingPurchases } from "@/lib/economy/shop";
import { prisma } from "@/server/db";
import { lotViews } from "@/server/economy/lot-view";
import { getPaymentProvider } from "@/server/payments/provider";
import { getSetting } from "@/server/settings";
import { getCurrentUser } from "@/server/user";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const SOON_MS = 3 * 86_400_000;

/** Boutique en Zeni : articles pilotés par l'admin, chacun livre un lot montré sur sa scène. */
export default async function ShopPage() {
  const [t, user, locale] = await Promise.all([getTranslations("economy.shop"), getCurrentUser(), getLocale()]);
  if (!user) {
    return (
      <PageShell>
        <GuestBootstrap />
      </PageShell>
    );
  }

  const [enabled, premiumEnabled, timeZone] = await Promise.all([
    getSetting("shop.enabled"),
    getSetting("shop.premiumEnabled"),
    getSetting("game.timeZone"),
  ]);
  const now = new Date();
  const items = enabled
    ? (
        await prisma.shopItem.findMany({
          where: { active: true, priceZeni: { not: null } },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            name: true,
            description: true,
            lotId: true,
            active: true,
            priceZeni: true,
            perUserLimit: true,
            limitPeriod: true,
            startsAt: true,
            endsAt: true,
          },
        })
      ).filter((item) => onSaleForZeni(item, now))
    : [];

  // Achats du joueur dans la fenêtre de chaque limite
  const bought = new Map<string, number>();
  await Promise.all(
    items
      .filter((i) => i.perUserLimit !== null)
      .map(async (i) => {
        const periodKey = limitPeriodKey(i.limitPeriod, now, timeZone);
        bought.set(
          i.id,
          await prisma.purchase.count({ where: { userId: user.id, shopItemId: i.id, periodKey, status: { in: ["PENDING", "PAID"] } } }),
        );
      }),
  );
  const lots = await lotViews(
    items.map((i) => i.lotId),
    locale,
  );
  // Paiement par carte : seulement si l'admin l'active ET qu'un fournisseur est branché (jamais pour l'instant)
  const premium = premiumEnabled && getPaymentProvider() !== null;

  return (
    <PageShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionTitle level={1} kanji="商店" title={t("title")} subtitle={t("intro")} />
        <div className="flex items-center gap-2 rounded-full border border-kin/50 bg-surface px-4 py-2" aria-label={t("balance", { amount: user.coins })}>
          <ZeniCoin size={20} />
          <span aria-hidden="true" className="text-lg font-bold tabular-nums text-kin">
            {t("amount", { amount: user.coins })}
          </span>
        </div>
      </div>

      {!enabled && <p className="lacquer rounded-card p-6 text-center text-text-muted">{t("disabled")}</p>}
      {enabled && items.length === 0 && (
        <p className="lacquer rounded-card p-6 text-center text-text-muted">{t("empty")}</p>
      )}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const price = item.priceZeni!;
          const lot = lots.get(item.lotId);
          const remaining = remainingPurchases(item.perUserLimit, bought.get(item.id) ?? 0);
          const description = localize(parseLocalized(item.description), locale);
          const booster = lot?.lines.find((l) => l.kind === "BOOSTER");
          const endsSoon = item.endsAt !== null && item.endsAt.getTime() - now.getTime() < SOON_MS;
          const affordable = user.coins >= price;
          return (
            <li
              key={item.id}
              className="group flex flex-col overflow-hidden lacquer rounded-card transition-colors hover:border-kin/60"
            >
              <div className="relative">
                <LotStage lot={lot} className="h-44 transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none" />
                {endsSoon && (
                  <span className="absolute top-2 left-2 rounded-sm bg-shu-btn px-2 py-0.5 text-xs font-bold text-washi-paper">
                    {t("endsSoon")}
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex flex-col gap-1">
                  <h2 className="font-title text-lg font-bold">{localize(parseLocalized(item.name), locale)}</h2>
                  {description && <p className="text-sm text-text-muted">{description}</p>}
                </div>
                <LotRewards lot={lot} />
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
                  {item.perUserLimit !== null && item.limitPeriod && (
                    <span className={remaining === 0 ? "text-shu" : ""}>
                      {t(`limit.${item.limitPeriod}`, { count: remaining ?? 0, limit: item.perUserLimit })}
                    </span>
                  )}
                  {item.endsAt && <span>{t("until", { date: item.endsAt })}</span>}
                </div>
                <div className="mt-auto flex flex-col gap-2 border-t border-dashed border-border pt-3">
                  <p className="flex items-baseline gap-1.5">
                    <ZeniCoin size={18} />
                    <span className={`text-2xl font-bold tabular-nums ${affordable ? "text-kin" : "text-text-muted"}`}>
                      {t("amount", { amount: price })}
                    </span>
                    <span className="text-sm text-text-muted">Zeni</span>
                  </p>
                  <BuyButton
                    shopItemId={item.id}
                    price={price}
                    affordable={affordable}
                    remaining={remaining}
                    openHref={booster && booster.kind === "BOOSTER" ? `/ouvrir/${booster.look.slug}?credit=1` : undefined}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <aside className="flex flex-col items-start gap-3 lacquer rounded-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="font-bold">{t("earnTitle")}</p>
          <p className="text-sm text-text-muted">{t("earnBody")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/missions">{t("toMissions")}</ButtonLink>
          <ButtonLink href="/collection">{t("toRecycle")}</ButtonLink>
        </div>
      </aside>

      {/* Zone « Packs premium » : les articles en euros s'y ajouteront avec le fournisseur de paiement */}
      {premium && (
        <section className="flex flex-col gap-2 lacquer rounded-card p-4">
          <h2 className="font-title text-lg font-bold">{t("premium")}</h2>
          <p className="text-sm text-text-muted">{t("premiumSoon")}</p>
        </section>
      )}
    </PageShell>
  );
}
