import { getRarities } from "@/server/catalog/rarities";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { ZeniCoin } from "@/components/layout/ZeniCoin";
import { ListingBoard } from "@/components/market/listings/ListingBoard";
import { MyExchanges } from "@/components/market/listings/MyExchanges";
import { MarketFilters } from "@/components/market/MarketFilters";
import { MarketList } from "@/components/market/MarketList";
import { PageShell } from "@/components/PageShell";
import { SectionTitle } from "@/components/SectionTitle";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { segmentedCompactItemClass, segmentedFillClass, segmentedTrackClass } from "@/components/ui/Segmented";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { MARKET_TABS, marketSearchParams, parseMarketParams } from "@/lib/market/filters";
import { parseListingFilter } from "@/lib/market/listings";
import { countIncomingOffers, listListings, listMyExchanges } from "@/server/market/listings";
import { listAuctions } from "@/server/market/queries";
import { getSetting } from "@/server/settings";
import { getCurrentUser } from "@/server/user";

export async function generateMetadata({ params }: PageProps<"/[locale]/marche">): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "market" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

const EXCHANGE_TABS = ["echanges", "mes-echanges"] as const;
type ExchangeTab = (typeof EXCHANGE_TABS)[number];

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Hôtel des ventes : ventes ouvertes, filtres dans l'URL, onglets « Mes ventes » et « Mes enchères »,
 * puis les échanges ouverts (« Échanges », « Mes échanges »).
 */
export default async function MarketPage({ searchParams }: PageProps<"/[locale]/marche">) {
  const [t, user, locale] = await Promise.all([getTranslations("market"), getCurrentUser(), getLocale()]);
  if (!user) {
    return (
      <PageShell>
        <GuestBootstrap />
      </PageShell>
    );
  }

  const raw = await searchParams;
  const [enabled, listingsOn] = await Promise.all([getSetting("market.enabled"), getSetting("listings.enabled")]);
  const exchangesOn = enabled && listingsOn;
  const rawTab = one(raw.onglet);
  const exchangeTab: ExchangeTab | null =
    exchangesOn && (EXCHANGE_TABS as readonly string[]).includes(rawTab ?? "") && !(user.isGuest && rawTab === "mes-echanges")
      ? (rawTab as ExchangeTab)
      : null;
  const parsed = parseMarketParams(raw, await getRarities());
  // Les invités n'ont ni ventes ni mises : seulement la liste générale
  const params = user.isGuest ? { ...parsed, tab: "all" as const } : parsed;
  // Invités : une seule piste « Toutes · Échanges » ; membres : une piste pour les ventes, une pour les échanges
  const tabGroups: (readonly ((typeof MARKET_TABS)[number] | ExchangeTab)[])[] = user.isGuest
    ? exchangesOn
      ? [["all", "echanges"]]
      : []
    : exchangesOn
      ? [MARKET_TABS, EXCHANGE_TABS]
      : [MARKET_TABS];
  const now = new Date();
  const page = enabled && !exchangeTab ? await listAuctions({ params, cursor: null, viewerId: user.id, locale, now }) : null;
  const incoming = exchangesOn && !user.isGuest ? await countIncomingOffers(user.id, now) : 0;
  const tabHref = (tab: string) => (tab === "all" ? "/marche" : `/marche?onglet=${tab}`);
  const current = exchangeTab ?? params.tab;

  return (
    <PageShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionTitle level={1} kanji="競売" title={t("title")} subtitle={t("intro")} />
        <div
          role="group"
          className="flex items-center gap-2 rounded-full border border-kin/50 bg-surface px-4 py-2"
          aria-label={t("balance", { amount: user.coins })}
        >
          <ZeniCoin size={20} />
          <span aria-hidden="true" className="text-lg font-bold tabular-nums text-kin">
            {t("zeni", { amount: user.coins })}
          </span>
        </div>
      </div>

      {!enabled ? (
        <p className="lacquer rounded-card p-6 text-center text-text-muted">{t("disabled")}</p>
      ) : (
        <>
          {user.isGuest && (
            <aside className="flex flex-col items-start gap-3 lacquer rounded-card p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm">{t("guest")}</p>
              <ButtonLink href="/inscription" variant="primary">
                {t("signUp")}
              </ButtonLink>
            </aside>
          )}

          {tabGroups.length > 0 && (
            // Une piste par famille d'onglets (ventes, échanges), empilées sur mobile : tout reste visible sans défiler
            <nav aria-label={t("tabs.label")} className="flex flex-col gap-2 md:flex-row md:flex-wrap">
              {tabGroups.map((group) => (
                <ul key={group[0]} className={`${segmentedTrackClass} ${segmentedFillClass} md:w-auto`}>
                  {group.map((tab) => (
                    <li key={tab} className="flex min-w-0">
                      <Link href={tabHref(tab)} aria-current={current === tab ? "page" : undefined} className={segmentedCompactItemClass}>
                        {t(`tabs.${tab}`)}
                        {tab === "mes-echanges" && incoming > 0 && (
                          <span className="rounded-pill bg-shu px-1.5 text-xs font-bold text-washi-paper tabular-nums">
                            <span className="sr-only">{t("tabs.incoming", { count: incoming })}</span>
                            <span aria-hidden="true">{incoming > 9 ? "9+" : incoming}</span>
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              ))}
            </nav>
          )}

          {exchangeTab === "echanges" && <ExchangeBoard userId={user.id} guest={user.isGuest} locale={locale} raw={raw} />}
          {exchangeTab === "mes-echanges" && <MyExchangesTab userId={user.id} locale={locale} />}
        </>
      )}

      {page && (
        <>
          <MarketFilters params={params} />

          <MarketList
            initial={page.items}
            nextCursor={page.nextCursor}
            query={Object.fromEntries(marketSearchParams(params))}
            serverNow={now.getTime()}
            emptyText={t(`empty.${params.tab}`)}
          />
        </>
      )}
    </PageShell>
  );
}

async function ExchangeBoard({
  userId,
  guest,
  locale,
  raw,
}: {
  userId: string;
  guest: boolean;
  locale: string;
  raw: Record<string, string | string[] | undefined>;
}) {
  const filter = guest ? "all" : parseListingFilter(raw.filtre);
  const q = (one(raw.q) ?? "").slice(0, 100);
  const [page, maxWants, allowOther] = await Promise.all([
    listListings({ viewerId: userId, q, filter, cursor: null, locale }),
    getSetting("listings.maxWants"),
    getSetting("listings.allowOther"),
  ]);
  return (
    <ListingBoard
      initial={page.items}
      nextCursor={page.nextCursor}
      filter={filter}
      q={q}
      guest={guest}
      maxWants={maxWants}
      allowOther={allowOther}
    />
  );
}

async function MyExchangesTab({ userId, locale }: { userId: string; locale: string }) {
  return <MyExchanges data={await listMyExchanges(userId, locale)} />;
}
