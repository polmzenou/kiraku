import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { ZeniCoin } from "@/components/layout/ZeniCoin";
import { MarketFilters } from "@/components/market/MarketFilters";
import { MarketList } from "@/components/market/MarketList";
import { PageShell } from "@/components/PageShell";
import { SectionTitle } from "@/components/SectionTitle";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { MARKET_TABS, marketSearchParams, parseMarketParams } from "@/lib/market/filters";
import { listAuctions } from "@/server/market/queries";
import { getSetting } from "@/server/settings";
import { getCurrentUser } from "@/server/user";

export async function generateMetadata({ params }: PageProps<"/[locale]/marche">): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "market" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/** Hôtel des ventes : ventes ouvertes, filtres dans l'URL, onglets « Mes ventes » et « Mes enchères ». */
export default async function MarketPage({ searchParams }: PageProps<"/[locale]/marche">) {
  const [t, user, locale] = await Promise.all([getTranslations("market"), getCurrentUser(), getLocale()]);
  if (!user) {
    return (
      <PageShell>
        <GuestBootstrap />
      </PageShell>
    );
  }

  const enabled = await getSetting("market.enabled");
  const parsed = parseMarketParams(await searchParams);
  // Les invités n'ont ni ventes ni mises : seulement la liste générale
  const params = user.isGuest ? { ...parsed, tab: "all" as const } : parsed;
  const tabs = user.isGuest ? (["all"] as const) : MARKET_TABS;
  const now = new Date();
  const page = enabled ? await listAuctions({ params, cursor: null, viewerId: user.id, locale, now }) : null;

  return (
    <PageShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionTitle level={1} kanji="競売" title={t("title")} subtitle={t("intro")} />
        <div
          className="flex items-center gap-2 rounded-full border border-kin/50 bg-surface px-4 py-2"
          aria-label={t("balance", { amount: user.coins })}
        >
          <ZeniCoin size={20} />
          <span aria-hidden="true" className="text-lg font-bold tabular-nums text-kin">
            {t("zeni", { amount: user.coins })}
          </span>
        </div>
      </div>

      {!page ? (
        <p className="rounded-lg border border-border bg-surface p-6 text-center text-text-muted">{t("disabled")}</p>
      ) : (
        <>
          {user.isGuest && (
            <aside className="flex flex-col items-start gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm">{t("guest")}</p>
              <ButtonLink href="/inscription" variant="shu">
                {t("signUp")}
              </ButtonLink>
            </aside>
          )}

          {tabs.length > 1 && (
            <nav aria-label={t("tabs.label")} className="-mx-4 overflow-x-auto px-4">
              <ul className="flex gap-2">
                {tabs.map((tab) => {
                  const current = params.tab === tab;
                  return (
                    <li key={tab}>
                      <Link
                        href={tab === "all" ? "/marche" : `/marche?onglet=${tab}`}
                        aria-current={current ? "page" : undefined}
                        className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-bold whitespace-nowrap ${
                          current ? "border-shu bg-shu-btn text-washi-paper" : "border-border bg-surface-2"
                        }`}
                      >
                        {t(`tabs.${tab}`)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          )}

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
