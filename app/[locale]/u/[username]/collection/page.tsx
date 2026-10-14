import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { CollectionFilters } from "@/components/collection/CollectionFilters";
import { CollectionGrid } from "@/components/collection/CollectionGrid";
import { CollectionStats } from "@/components/collection/CollectionStats";
import { PageShell } from "@/components/PageShell";
import { displayName } from "@/components/profile/ProfileHeader";
import { Link, redirect } from "@/i18n/navigation";
import { collectionQuery, hasFilters, parseCollectionParams } from "@/lib/collection/params";
import { loadProfile } from "@/server/collection/profile-page";
import { getCollectionPage, getCollectionSummary, getOwnedSeries } from "@/server/collection/queries";
import { getSetting } from "@/server/settings";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Collection d'un autre joueur, en lecture seule (si son profil et son réglage le permettent). */
export default async function PublicCollectionPage({ params, searchParams }: PageProps<"/[locale]/u/[username]/collection">) {
  const { username } = await params;
  const locale = await getLocale();
  const { owner, access } = await loadProfile(username, locale, "/collection");
  // Sa propre collection : la page complète, avec recyclage
  if (access.isOwner) redirect({ href: "/collection", locale });

  const [t, tAccount] = await Promise.all([getTranslations("profile"), getTranslations("account")]);
  const name = displayName(owner.username, owner.isGuest, (code) => tAccount("guestName", { code }));
  const back = (
    <Link href={`/u/${owner.username}`} className="inline-flex min-h-11 w-fit items-center text-ai underline underline-offset-4">
      {t("backToProfile", { name })}
    </Link>
  );

  if (!access.collection) {
    return (
      <PageShell>
        {back}
        <p className="rounded-lg border border-border bg-surface p-6 text-center text-text-muted">{t("collectionHidden")}</p>
      </PageShell>
    );
  }

  const filters = parseCollectionParams(await searchParams);
  const values = await getSetting("collection.recycleValues");
  const [summary, page, series] = await Promise.all([
    getCollectionSummary(owner.id, values),
    getCollectionPage(owner.id, filters, 0, locale),
    getOwnedSeries(owner.id, locale),
  ]);
  const query = collectionQuery(filters);

  return (
    <PageShell>
      {back}
      <h1 className="font-title text-3xl font-extrabold">{t("collectionOf", { name })}</h1>
      <CollectionStats summary={summary} />
      <CollectionFilters params={filters} pathname={`/u/${owner.username}/collection`} series={series} />
      {page.items.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface p-6 text-center text-text-muted">
          {hasFilters(filters) ? t("noMatch") : t("collectionEmpty")}
        </p>
      ) : (
        <CollectionGrid key={JSON.stringify(query)} initial={page} query={query} username={owner.username} linkBase="/wiki" />
      )}
    </PageShell>
  );
}
