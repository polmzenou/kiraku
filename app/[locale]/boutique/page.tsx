import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { BuyButton } from "@/components/economy/BuyButton";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { ZeniCoin } from "@/components/layout/ZeniCoin";
import { PageShell } from "@/components/PageShell";
import { SectionTitle } from "@/components/SectionTitle";
import { packTitleId } from "@/components/shop/PackCard";
import "@/components/shop/shop.css";
import { ShopNoren } from "@/components/shop/ShopNoren";
import { ShopShelves } from "@/components/shop/ShopShelves";
import { ShopStage } from "@/components/shop/ShopStage";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { localize, parseLocalized } from "@/lib/boosters/types";
import { periodWindow } from "@/lib/economy/period";
import { onSaleForZeni, parseShopText } from "@/lib/economy/shop";
import { buildShopView, purchaseKey, shopLotFrom, type ShopCard } from "@/lib/economy/shop-view";
import { getRarityDefinitions } from "@/server/catalog/rarities";
import { prisma } from "@/server/db";
import { lotViews, type LotView } from "@/server/economy/lot-view";
import { getBoosterCredits } from "@/server/economy/queries";
import { loadShopTypes } from "@/server/economy/shop-guard";
import { getPaymentProvider } from "@/server/payments/provider";
import { getSetting } from "@/server/settings";
import { getCurrentUser } from "@/server/user";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Boutique en Zeni : articles pilotés par l'admin, rangés par famille de booster, avec la vedette du
 * jour. buildShopView décide ce qui se vend (la même règle que l'achat), la page charge et affiche.
 */
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
  const day = periodWindow("DAILY", now, timeZone);
  const week = periodWindow("WEEKLY", now, timeZone);

  // Une seule vague : articles, achats du joueur sur les trois fenêtres de limite possibles
  // (à vie, jour, semaine), types de booster, crédits et raretés
  const [rows, bought, types, credits, definitions] = await Promise.all([
    enabled
      ? prisma.shopItem.findMany({
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
      : [],
    enabled
      ? prisma.purchase.groupBy({
          by: ["shopItemId", "periodKey"],
          where: { userId: user.id, periodKey: { in: ["all", day.key, week.key] }, status: { in: ["PENDING", "PAID"] } },
          _count: { _all: true },
        })
      : [],
    enabled ? loadShopTypes() : new Map(),
    enabled ? getBoosterCredits(user.id) : new Map<string, number>(),
    enabled ? getRarityDefinitions() : [],
  ]);

  const items = rows.filter((item) => onSaleForZeni(item, now));
  const lots = await lotViews(
    items.map((i) => i.lotId),
    locale,
  );
  const view = buildShopView<LotView>({
    items: items.map((i) => ({
      id: i.id,
      name: localize(parseLocalized(i.name), locale),
      description: localize(parseShopText(i.description), locale),
      lotId: i.lotId,
      priceZeni: i.priceZeni!,
      perUserLimit: i.perUserLimit,
      limitPeriod: i.limitPeriod,
      endsAt: i.endsAt,
    })),
    lots: new Map([...lots].map(([id, lot]) => [id, shopLotFrom(lot)])),
    types,
    bought: new Map(bought.map((b) => [purchaseKey(b.shopItemId, b.periodKey), b._count._all])),
    credits,
    definitions,
    now,
    timeZone,
  });
  // Paiement par carte : seulement si l'admin l'active ET qu'un fournisseur est branché (jamais pour l'instant)
  const premium = premiumEnabled && getPaymentProvider() !== null;
  const empty = view.sections.length === 0;

  const renderBuy = (card: ShopCard<LotView>, place: "hero" | "grid") => {
    const line = card.lot.lines.find((l) => l.kind === "BOOSTER");
    return (
      <BuyButton
        // La vedette change à minuit : son bouton repart de zéro
        key={place === "hero" ? card.id : undefined}
        shopItemId={card.id}
        price={card.price}
        affordable={user.coins >= card.price}
        remaining={card.remaining}
        openHref={card.openHref ?? undefined}
        celebration={line?.kind === "BOOSTER" ? { look: line.look, name: line.name } : undefined}
        describedBy={place === "hero" ? `vedette-${card.id}-title` : packTitleId(card.id)}
        size={place === "hero" ? "lg" : "md"}
      />
    );
  };

  return (
    <PageShell>
      <ShopStage>
        {enabled && <ShopNoren />}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionTitle level={1} kanji="商店" title={t("title")} subtitle={t("intro")} />
          <p className="flex items-center gap-2 rounded-full border border-kin/50 bg-surface px-4 py-2">
            <span className="sr-only">{t("balance", { amount: user.coins })}</span>
            <ZeniCoin size={20} />
            <span aria-hidden="true" className="text-lg font-bold tabular-nums text-kin">
              {t("amount", { amount: user.coins })}
            </span>
          </p>
        </div>

        {!enabled && <p className="lacquer rounded-card p-6 text-center text-text-muted">{t("disabled")}</p>}
        {enabled && empty && <p className="lacquer rounded-card p-6 text-center text-text-muted">{t("empty")}</p>}
        {!empty && <ShopShelves view={view} coins={user.coins} now={now} dayEndsAt={day.end} renderBuy={renderBuy} />}

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
            <h2 className="font-heading text-lg font-bold">{t("premium")}</h2>
            <p className="text-sm text-text-muted">{t("premiumSoon")}</p>
          </section>
        )}
      </ShopStage>
    </PageShell>
  );
}
