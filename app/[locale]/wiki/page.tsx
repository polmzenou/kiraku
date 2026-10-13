import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Fuda } from "@/components/fuda/Fuda";
import { PageShell } from "@/components/PageShell";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { WikiSearch } from "@/components/wiki/WikiSearch";
import { getPathname, Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { seriesTitle } from "@/lib/catalog/display";
import { RARITIES, RARITY_SEAL } from "@/lib/catalog/rarity";
import { parseWikiParams, wikiQuery } from "@/lib/catalog/wiki-params";
import { getCatalogStats, searchCatalog } from "@/server/catalog/queries";

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
  const [t, tRarity, locale, stats, { cards, nextAfter }] = await Promise.all([
    getTranslations("wiki"),
    getTranslations("rarity"),
    getLocale(),
    getCatalogStats(),
    searchCatalog(params),
  ]);

  const chip = (active: boolean) =>
    `inline-flex min-h-11 items-center gap-1.5 rounded-button border px-3 text-sm ${
      active ? "border-text bg-surface-2 font-bold" : "border-border bg-surface text-text-muted"
    }`;

  return (
    <PageShell>
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold">{t("title")}</h1>
        <p className="text-sm text-text-muted">{t("count", { count: stats.total })}</p>
      </header>

      <WikiSearch
        key={params.rarity ?? "all"}
        initialQuery={params.q}
        rarity={params.rarity}
        action={getPathname({ href: "/wiki", locale })}
      />

      <nav aria-label={t("rarityFilter")} className="flex flex-wrap gap-2">
        <Link
          href={{ pathname: "/wiki", query: wikiQuery({ q: params.q }) }}
          className={chip(params.rarity === null)}
          aria-current={params.rarity === null ? "page" : undefined}
        >
          {t("allRarities")}
        </Link>
        {[...RARITIES].reverse().map((r) => (
          <Link
            key={r}
            href={{ pathname: "/wiki", query: wikiQuery({ q: params.q, rarity: r }) }}
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

      {cards.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface p-6 text-center text-text-muted">
          {stats.total === 0 ? t("emptyCatalog") : t("empty")}
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 md:grid-cols-4 md:gap-3 lg:grid-cols-6 xl:grid-cols-8">
          {cards.map((card, i) => (
            <li key={card.anilistId}>
              <Link
                href={`/wiki/${card.anilistId}`}
                className="block rounded-[5px] transition-transform active:scale-[0.97]"
              >
                <Fuda card={card} series={seriesTitle(card.series, locale)} size="sm" preload={i < 3 && !params.after} />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {(nextAfter || params.after) && (
        <nav aria-label={t("pagination")} className="flex flex-wrap justify-center gap-3">
          {params.after && (
            <ButtonLink href={{ pathname: "/wiki", query: wikiQuery({ q: params.q, rarity: params.rarity }) }}>
              {t("first")}
            </ButtonLink>
          )}
          {nextAfter && (
            <ButtonLink href={{ pathname: "/wiki", query: wikiQuery({ q: params.q, rarity: params.rarity, after: nextAfter }) }}>
              {t("next")}
            </ButtonLink>
          )}
        </nav>
      )}

      <p className="text-xs text-text-muted">
        {t.rich("attribution", {
          anilist: (chunks) => (
            <a href="https://anilist.co" rel="noopener noreferrer" target="_blank" className="text-ai underline">
              {chunks}
            </a>
          ),
        })}
      </p>
    </PageShell>
  );
}
