import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { PageShell } from "@/components/PageShell";
import { WikiCardDetail, WikiPersonalizedCardDetail } from "@/components/wiki/WikiCardDetail";
import { WikiWishlistAction } from "@/components/wiki/WikiWishlistAction";
import { routing } from "@/i18n/routing";
import { seriesTitle } from "@/lib/catalog/display";
import { JsonLd } from "@/components/seo/JsonLd";
import { localeAlternates, localePath } from "@/lib/seo/alternates";
import { baseOpenGraph } from "@/lib/seo/open-graph";
import { breadcrumbs } from "@/lib/seo/structured-data";
import { appUrl } from "@/server/env";
import { getCatalogCard, getCatalogStats, getRelatedCatalogCards } from "@/server/catalog/queries";

const idSchema = z.coerce.number().int().positive().max(2_147_483_647);

async function loadCard(raw: string) {
  const id = idSchema.safeParse(raw);
  return id.success ? getCatalogCard(id.data) : null;
}

export async function generateMetadata({ params }: PageProps<"/[locale]/wiki/[anilistId]">): Promise<Metadata> {
  const { locale: rawLocale, anilistId } = await params;
  const card = await loadCard(anilistId);
  if (!card) return {};
  const locale = hasLocale(routing.locales, rawLocale) ? rawLocale : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "wiki" });
  const href = `/wiki/${card.anilistId}`;
  const description = t("cardDescription", { name: card.name, series: seriesTitle(card.series, locale) });
  return {
    title: card.name,
    description,
    alternates: localeAlternates(href, locale),
    openGraph: { ...baseOpenGraph(locale), title: card.name, description, images: [{ url: card.imageUrl, alt: card.name }] },
    twitter: { card: "summary", title: card.name, description, images: [card.imageUrl] },
  };
}

export default async function WikiCardPage({ params }: PageProps<"/[locale]/wiki/[anilistId]">) {
  const { anilistId } = await params;
  const card = await loadCard(anilistId);
  if (!card) notFound();
  const [locale, stats, related, tMeta, tWiki] = await Promise.all([
    getLocale(),
    getCatalogStats(),
    getRelatedCatalogCards(card.seriesId, card.anilistId),
    getTranslations("metadata"),
    getTranslations("wiki"),
  ]);
  const current = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
  const trail = breadcrumbs(appUrl(), [
    { name: tMeta("title"), path: localePath("/", current) },
    { name: tWiki("title"), path: localePath("/wiki", current) },
    { name: card.name, path: localePath(`/wiki/${card.anilistId}`, current) },
  ]);
  const wishlistAction = <Suspense fallback={null}><WikiWishlistAction cardId={card.id} name={card.name} /></Suspense>;
  const detail = { card, locale, total: stats.total, related, wishlistAction };
  return (
    <PageShell>
      <JsonLd data={trail} />
      <Suspense fallback={<WikiCardDetail {...detail} collection={null} />}>
        <WikiPersonalizedCardDetail {...detail} />
      </Suspense>
    </PageShell>
  );
}
