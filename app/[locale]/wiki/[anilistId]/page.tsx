import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Fuda } from "@/components/fuda/Fuda";
import { PageShell } from "@/components/PageShell";
import { getPathname, Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cardNumber, seriesTitle } from "@/lib/catalog/display";
import { RARITY_SEAL } from "@/lib/catalog/rarity";
import { getCatalogCard, getCatalogStats } from "@/server/catalog/queries";

const idSchema = z.coerce.number().int().positive().max(10_000_000);

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
  return {
    title: card.name,
    description: t("cardDescription", { name: card.name, series: seriesTitle(card.series, locale) }),
    alternates: {
      canonical: getPathname({ href, locale }),
      languages: Object.fromEntries(routing.locales.map((l) => [l, getPathname({ href, locale: l })])),
    },
  };
}

export default async function WikiCardPage({ params }: PageProps<"/[locale]/wiki/[anilistId]">) {
  const { anilistId } = await params;
  const card = await loadCard(anilistId);
  if (!card) notFound();

  const [t, tRarity, tRole, locale, stats] = await Promise.all([
    getTranslations("wiki"),
    getTranslations("rarity"),
    getTranslations("wiki.roles"),
    getLocale(),
    getCatalogStats(),
  ]);
  const series = seriesTitle(card.series, locale);
  // L'autre titre (romaji ou anglais) en sous-titre, seulement s'il apporte quelque chose
  const otherTitle = [card.series.titleRomaji, card.series.titleEnglish].find(
    (title) => title && title.toLowerCase() !== series.toLowerCase(),
  );

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );

  return (
    <PageShell>
      <Link href="/wiki" className="inline-flex min-h-11 w-fit items-center text-ai underline underline-offset-4">
        {t("back")}
      </Link>

      <article className="flex flex-col gap-6 md:flex-row md:items-start md:gap-10">
        <div className="mx-auto w-full max-w-[280px] md:mx-0 md:w-[320px] md:max-w-none md:shrink-0">
          <Fuda card={card} series={series} size="lg" preload />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <header className="flex flex-col gap-1">
            <p className="text-sm text-text-muted">{t("number", { number: cardNumber(card.rank) })}</p>
            <h1 className="text-3xl font-extrabold">{card.name}</h1>
            {card.nameNative && (
              <p lang="ja" className="font-title text-lg text-text-muted">
                {card.nameNative}
              </p>
            )}
            {card.rank === null && (
              <p className="mt-2 w-fit rounded-sm border border-shu px-2 py-0.5 text-sm text-shu">{t("outOfCatalog")}</p>
            )}
          </header>

          <dl className="rounded-lg border border-border bg-surface px-4">
            {row(
              t("rarity"),
              <span className="inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="fuda inline-flex size-7 items-center justify-center rounded-[3px] font-seal text-lg text-washi-paper"
                  data-rarity={card.rarity}
                  style={{ background: "var(--fuda-frame)" }}
                >
                  {RARITY_SEAL[card.rarity]}
                </span>
                {tRarity(card.rarity)}
              </span>,
            )}
            {card.rank !== null && row(t("rank"), t("rankOf", { rank: card.rank, total: stats.total }))}
            {row(
              t("series"),
              <span className="flex flex-col">
                <span>{series}</span>
                {otherTitle && <span className="text-sm font-normal text-text-muted">{otherTitle}</span>}
              </span>,
            )}
            {card.role && row(t("role"), tRole(card.role as "MAIN" | "SUPPORTING" | "BACKGROUND"))}
            {row(t("favorites"), t("favoritesValue", { count: card.favorites }))}
            {row(
              t("power"),
              <span>
                <span aria-hidden="true" className="font-seal">力</span> {card.power}
              </span>,
            )}
            {row(
              t("ki"),
              <span>
                <span aria-hidden="true" className="font-seal">気</span> {card.ki}
              </span>,
            )}
          </dl>

          <a
            href={`https://anilist.co/character/${card.anilistId}`}
            rel="noopener noreferrer"
            target="_blank"
            className="inline-flex min-h-11 w-fit items-center text-ai underline underline-offset-4"
          >
            {t("viewOnAnilist")}
          </a>
        </div>
      </article>
    </PageShell>
  );
}
