import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { PageShell } from "@/components/PageShell";
import { WikiSearch } from "@/components/wiki/WikiSearch";
import { WikiGrid, WikiGridSkeleton } from "@/components/wiki/WikiGrid";
import { WikiResults } from "@/components/wiki/WikiResults";
import { getPathname, Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { RARITIES, RARITY_SEAL } from "@/lib/catalog/rarity";
import { parseWikiParams, wikiQuery, WIKI_OWNERSHIPS } from "@/lib/catalog/wiki-params";
import { emptyWikiCollection, selectWikiPage } from "@/lib/catalog/wiki-state";
import { getCatalogStats, getCatalogSearchIndex, getCatalogSummaries } from "@/server/catalog/queries";

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
  const [t, tRarity, locale, stats, index] = await Promise.all([
    getTranslations("wiki"),
    getTranslations("rarity"),
    getLocale(),
    getCatalogStats(),
    getCatalogSearchIndex(params),
  ]);
  const publicPage = selectWikiPage(index, { after: params.after, ownership: "all" }, emptyWikiCollection());
  const publicCards = params.ownership === "all" ? await getCatalogSummaries(publicPage.ids) : [];

  const chip = (active: boolean) =>
    `inline-flex min-h-11 items-center gap-1.5 rounded-button border px-3 text-sm ${
      active ? "border-text bg-surface-2 font-bold" : "border-border bg-surface text-text-muted"
    }`;

  return (
    <PageShell>
      <div className="wiki-content flex min-w-0 flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl font-extrabold">{t("title")}</h1>
          <p className="text-sm text-text-muted">{t("count", { count: stats.total })}</p>
        </header>

        <WikiSearch
          key={`${params.q}:${params.rarity}:${params.ownership}`}
          initialQuery={params.q}
          rarity={params.rarity}
          ownership={params.ownership}
          action={getPathname({ href: "/wiki", locale })}
        />

        <nav aria-label={t("rarityFilter")} className="flex flex-wrap gap-2">
          <Link
            href={{ pathname: "/wiki", query: wikiQuery({ q: params.q, ownership: params.ownership }) }}
            className={chip(params.rarity === null)}
            aria-current={params.rarity === null ? "page" : undefined}
          >
            {t("allRarities")}
          </Link>
          {[...RARITIES].reverse().map((r) => (
            <Link
              key={r}
              href={{ pathname: "/wiki", query: wikiQuery({ q: params.q, rarity: r, ownership: params.ownership }) }}
              className={chip(params.rarity === r)}
              aria-current={params.rarity === r ? "page" : undefined}
            >
              <span aria-hidden="true" className="font-seal text-base">
                {RARITY_SEAL[r]}
              </span>
              {tRarity(r)}
              <span className="tabular-nums text-text-muted">{stats.byRarity[r]}</span>
            </Link>
          ))}
        </nav>

        <nav aria-label={t("ownershipFilter")} className="flex flex-wrap gap-2">
          {WIKI_OWNERSHIPS.map((ownership) => (
            <Link
              key={ownership}
              href={{ pathname: "/wiki", query: wikiQuery({ q: params.q, rarity: params.rarity, ownership }) }}
              className={chip(params.ownership === ownership)}
              aria-current={params.ownership === ownership ? "page" : undefined}
            >
              {t(`ownership.${ownership}`)}
            </Link>
          ))}
        </nav>

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
