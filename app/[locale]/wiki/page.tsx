import { getRarities } from "@/server/catalog/rarities";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { PageShell } from "@/components/PageShell";
import { WikiFilters } from "@/components/wiki/WikiFilters";
import { WikiGrid, WikiGridSkeleton } from "@/components/wiki/WikiGrid";
import { WikiResults } from "@/components/wiki/WikiResults";
import { routing } from "@/i18n/routing";
import { parseWikiParams, wikiIndexing } from "@/lib/catalog/wiki-params";
import { JsonLd } from "@/components/seo/JsonLd";
import { getPathname, Link } from "@/i18n/navigation";
import { getCardReleases, getNewCardBadge } from "@/server/catalog/releases";
import { localeAlternates, localePath } from "@/lib/seo/alternates";
import { breadcrumbs } from "@/lib/seo/structured-data";
import { appUrl } from "@/server/env";
import { emptyWikiCollection, selectWikiPage } from "@/lib/catalog/wiki-state";
import { getCatalogStats, getCatalogSearchIndex, getCatalogSummaries, getCatalogFilterOptions } from "@/server/catalog/queries";

export async function generateMetadata({ params, searchParams }: PageProps<"/[locale]/wiki">): Promise<Metadata> {
  const [{ locale: raw }, query, rarities] = await Promise.all([params, searchParams, getRarities()]);
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "wiki" });
  const { search, indexable } = wikiIndexing(parseWikiParams(query, rarities));
  return {
    title: t("title"),
    description: t("metaDescription"),
    alternates: localeAlternates("/wiki", locale, search),
    robots: indexable ? undefined : { index: false, follow: true },
  };
}

export default async function WikiPage({ searchParams }: PageProps<"/[locale]/wiki">) {
  const params = parseWikiParams(await searchParams, await getRarities());
  const locale = await getLocale();
  const [t, stats, index, options, releases, badge] = await Promise.all([
    getTranslations("wiki"),
    getCatalogStats(),
    getCatalogSearchIndex(params),
    getCatalogFilterOptions(locale),
    getCardReleases(),
    getNewCardBadge(),
  ]);
  const newIds = new Set(badge?.publicIds ?? []);
  const publicPage = selectWikiPage(index, { after: params.after, ownership: "all" }, emptyWikiCollection());
  const publicCards = params.ownership === "all" ? await getCatalogSummaries(publicPage.ids) : [];

  const current = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
  const trail = breadcrumbs(appUrl(), [
    { name: (await getTranslations("metadata"))("title"), path: localePath("/", current) },
    { name: t("title"), path: localePath("/wiki", current) },
  ]);

  return (
    <PageShell>
      <JsonLd data={trail} />
      <div className="wiki-content flex min-w-0 flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl font-extrabold">{t("title")}</h1>
          <p className="text-sm text-text-muted">{t("count", { count: stats.total })}</p>
          {badge ? (
            <Link
              href="/wiki/nouveautes"
              className="mt-2 inline-flex min-h-11 items-center gap-2 self-start rounded-full border border-shu/50 bg-shu/10 px-4 text-sm font-bold text-text transition-colors hover:border-shu hover:bg-shu/20"
            >
              <span aria-hidden="true" lang="ja" className="font-seal text-base leading-none text-shu">新</span>
              {t("newCardsLink", { count: badge.publicIds.length })}
              <span aria-hidden="true">→</span>
            </Link>
          ) : releases.length > 0 && (
            <Link href="/wiki/nouveautes" className="inline-flex min-h-11 items-center self-start text-sm text-text-muted underline-offset-4 hover:text-text hover:underline">
              {t("latestReleasesLink")}
            </Link>
          )}
        </header>

        <WikiFilters
          params={params}
          options={options}
          counts={stats.byRarity}
          action={getPathname({ href: "/wiki", locale })}
        />

        <Suspense key={JSON.stringify(params)} fallback={params.ownership === "all"
          ? <WikiGrid cards={publicCards} nextAfter={publicPage.nextAfter} params={params} locale={locale} collection={null} emptyCatalog={stats.total === 0} newIds={newIds} />
          : <WikiGridSkeleton />}
        >
          <WikiResults index={index} params={params} locale={locale} emptyCatalog={stats.total === 0} newIds={newIds} />
        </Suspense>

        <p className="text-xs text-text-muted">
          {t.rich("attribution", {
            anilist: (chunks) => (
              <a href="https://anilist.co" rel="noopener noreferrer" target="_blank" className="text-link underline">
                {chunks}
              </a>
            ),
          })}
        </p>
      </div>
    </PageShell>
  );
}
