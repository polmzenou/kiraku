import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { PageShell } from "@/components/PageShell";
import { JsonLd } from "@/components/seo/JsonLd";
import { NewCardsView, type ReleaseView } from "@/components/wiki/NewCardsView";
import { routing } from "@/i18n/routing";
import { byRarityThenName, type CardRelease } from "@/lib/catalog/releases";
import { isTopTier } from "@/lib/catalog/tiers";
import { wikiCardState } from "@/lib/catalog/wiki-state";
import { localeAlternates, localePath } from "@/lib/seo/alternates";
import { baseOpenGraph, ogImageUrl } from "@/lib/seo/open-graph";
import { breadcrumbs } from "@/lib/seo/structured-data";
import { getWikiCards } from "@/server/catalog/ownership";
import { getCatalogSummaries } from "@/server/catalog/queries";
import { getRarityDefinitions } from "@/server/catalog/rarities";
import { getCardReleases, getNewCardBadge, getReleaseBoosters } from "@/server/catalog/releases";
import { appUrl } from "@/server/env";
import { getSetting } from "@/server/settings";

export async function generateMetadata({ params }: PageProps<"/[locale]/wiki/nouveautes">): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "wiki.newCards" });
  const title = t("title");
  const description = t("metaDescription");
  return {
    title,
    description,
    alternates: localeAlternates("/wiki/nouveautes", locale),
    // Image du site, jamais une illustration : une nouvelle forme est souvent un spoil
    openGraph: { ...baseOpenGraph(locale), title, description },
    twitter: { card: "summary_large_image", title, description, images: [ogImageUrl(locale)] },
  };
}

/** Nouvelles cartes : la dernière sortie de l'admin (révélée), où la tirer, et les sorties précédentes. */
export default async function NewCardsPage() {
  const [locale, releases, badge, timeZone, definitions, tMeta, tWiki] = await Promise.all([
    getLocale(),
    getCardReleases(),
    getNewCardBadge(),
    getSetting("game.timeZone"),
    getRarityDefinitions(),
    getTranslations("metadata"),
    getTranslations("wiki"),
  ]);
  const [latest, ...previous] = releases;
  const all = releases.flatMap((r) => r.cards);
  const latestIds = latest?.cards.map((c) => c.id) ?? [];
  const publicIds = all.map((c) => c.publicId);
  const [summaries, collection, where, latestBoosters] = await Promise.all([
    getCatalogSummaries(publicIds),
    // Sans Suspense : remplacer un rendu de repli relancerait la révélation
    getWikiCards(publicIds),
    getReleaseBoosters(all.map((c) => c.id), locale),
    getReleaseBoosters(latestIds, locale),
  ]);

  const byPublicId = new Map(summaries.map((s) => [s.anilistId, s]));
  const boosterNames = new Map(where.boosters.map((b) => [b.slug, b.name]));
  const newIds = new Set(badge?.publicIds ?? []);
  const order = byRarityThenName(definitions.map((d) => d.key), locale);
  const view = (release: CardRelease): ReleaseView => ({
    day: release.day,
    lastPublishedAt: release.lastPublishedAt,
    items: release.cards
      .flatMap((c) => {
        const card = byPublicId.get(c.publicId);
        if (!card) return [];
        return [{
          card,
          premium: isTopTier(card.rarity, definitions),
          boosters: (where.byCard[c.id] ?? []).flatMap((slug) => boosterNames.get(slug) ?? []),
          state: wikiCardState(collection, c.publicId),
          isNew: newIds.has(c.publicId),
        }];
      })
      .sort((a, b) => order(a.card, b.card)),
  });

  const current = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
  const trail = breadcrumbs(appUrl(), [
    { name: tMeta("title"), path: localePath("/", current) },
    { name: tWiki("title"), path: localePath("/wiki", current) },
    { name: tWiki("newCards.title"), path: localePath("/wiki/nouveautes", current) },
  ]);

  return (
    <PageShell>
      <JsonLd data={trail} />
      <NewCardsView
        latest={latest ? view(latest) : null}
        previous={previous.map(view).filter((r) => r.items.length > 0)}
        boosters={latestBoosters.boosters}
        badgeUntil={badge?.until ?? null}
        timeZone={timeZone}
        locale={locale}
      />
    </PageShell>
  );
}
