import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { PageShell } from "@/components/PageShell";
import { WikiFilters } from "@/components/wiki/WikiFilters";
import { WikiGrid, WikiGridSkeleton } from "@/components/wiki/WikiGrid";
import { WikiResults } from "@/components/wiki/WikiResults";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { parseWikiParams } from "@/lib/catalog/wiki-params";
import { emptyWikiCollection, selectWikiPage } from "@/lib/catalog/wiki-state";
import { getCatalogStats, getCatalogSearchIndex, getCatalogSummaries, getCatalogFilterOptions } from "@/server/catalog/queries";

export async function generateMetadata({ params }: PageProps<"/[locale]/wiki">): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "wiki" });
  return {
    title: t("title"),
    description: t("metaDescription"),
    alternates: {
      canonical: getPathname({ href: "/wiki", locale }),
      languages: Object.fromEntries(routing.locales.map((l) => [l, getPathname({ href: "/wiki", locale: l })])),
    },
  };
}

export default async function WikiPage({ searchParams }: PageProps<"/[locale]/wiki">) {
  const params = parseWikiParams(await searchParams);
  const locale = await getLocale();
  const [t, stats, index, options] = await Promise.all([
    getTranslations("wiki"),
    getCatalogStats(),
    getCatalogSearchIndex(params),
    getCatalogFilterOptions(locale),
  ]);
  const publicPage = selectWikiPage(index, { after: params.after, ownership: "all" }, emptyWikiCollection());
  const publicCards = params.ownership === "all" ? await getCatalogSummaries(publicPage.ids) : [];

  return (
    <PageShell>
      <div className="wiki-content flex min-w-0 flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl font-extrabold">{t("title")}</h1>
          <p className="text-sm text-text-muted">{t("count", { count: stats.total })}</p>
        </header>

        <WikiFilters
          params={params}
          options={options}
          counts={stats.byRarity}
          action={getPathname({ href: "/wiki", locale })}
        />

        <Suspense key={JSON.stringify(params)} fallback={params.ownership === "all"
          ? <WikiGrid cards={publicCards} nextAfter={publicPage.nextAfter} params={params} locale={locale} collection={null} emptyCatalog={stats.total === 0} />
          : <WikiGridSkeleton />}
        >
          <WikiResults index={index} params={params} locale={locale} emptyCatalog={stats.total === 0} />
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
