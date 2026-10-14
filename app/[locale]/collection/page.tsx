import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { CollectionFilters } from "@/components/collection/CollectionFilters";
import { CollectionList } from "@/components/collection/CollectionList";
import { CollectionStats } from "@/components/collection/CollectionStats";
import { RecycleAllSheet } from "@/components/collection/RecycleAllSheet";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { PageShell } from "@/components/PageShell";
import { SectionTitle } from "@/components/SectionTitle";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { routing } from "@/i18n/routing";
import { RARITIES, type Rarity } from "@/lib/catalog/rarity";
import { collectionQuery, hasFilters, parseCollectionParams } from "@/lib/collection/params";
import { getCollectionPage, getCollectionSummary, getOwnedSeries } from "@/server/collection/queries";
import { getSetting } from "@/server/settings";
import { getCurrentUser } from "@/server/user";

export async function generateMetadata({ params }: PageProps<"/[locale]/collection">): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "collection" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function CollectionPage({ searchParams }: PageProps<"/[locale]/collection">) {
  const [t, user, locale] = await Promise.all([getTranslations("collection"), getCurrentUser(), getLocale()]);
  if (!user) {
    return (
      <PageShell>
        <GuestBootstrap />
      </PageShell>
    );
  }

  const params = parseCollectionParams(await searchParams);
  const values = await getSetting("collection.recycleValues");
  const [summary, page, series] = await Promise.all([
    getCollectionSummary(user.id, values),
    getCollectionPage(user.id, params, 0, locale),
    getOwnedSeries(user.id, locale),
  ]);
  const query = collectionQuery(params);
  const counts = Object.fromEntries(RARITIES.map((r) => [r, summary.byRarity[r].unique])) as Record<Rarity, number>;

  return (
    <PageShell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionTitle level={1} kanji="蒐集" title={t("title")} />
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/u/${user.username}`}>{t("myProfile")}</ButtonLink>
          <RecycleAllSheet byRarity={summary.byRarity} />
        </div>
      </div>

      <CollectionStats summary={summary} />
      {summary.recyclable > 0 && (
        <p className="text-sm text-text-muted">
          {t("recyclableHint", { count: summary.recyclable, zeni: summary.recyclableZeni })}
        </p>
      )}

      {summary.unique === 0 ? (
        <section className="flex flex-col items-center gap-4 rounded-lg border border-border bg-surface p-6 text-center">
          <p className="text-text-muted">{t("empty")}</p>
          <ButtonLink href="/" variant="shu">
            {t("openBoosters")}
          </ButtonLink>
        </section>
      ) : (
        <>
          <CollectionFilters params={params} pathname="/collection" series={series} counts={counts} />
          {page.items.length === 0 ? (
            <p className="rounded-lg border border-border bg-surface p-6 text-center text-text-muted">
              {hasFilters(params) ? t("noMatch") : t("empty")}
            </p>
          ) : (
            <CollectionList key={JSON.stringify(query)} initial={page} query={query} linkBase="/collection" />
          )}
        </>
      )}
    </PageShell>
  );
}
