
import { useRaritySeals } from "@/lib/catalog/use-rarities";
import { Suspense, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Fuda } from "@/components/fuda/Fuda";
import { FudaTurnover } from "@/components/fuda/FudaTurnover";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Link } from "@/i18n/navigation";
import { cardNumber, seriesTitle } from "@/lib/catalog/display";

import { wikiCardState, type WikiCollection } from "@/lib/catalog/wiki-state";
import { getWikiCollection } from "@/server/catalog/ownership";
import type { CatalogCardDetail, CatalogCardSummary } from "@/server/catalog/queries";
import { WikiBiography, WikiBiographySkeleton } from "./WikiBiography";
import { WikiCardValuation } from "./WikiCardValuation";

type DetailProps = {
  card: CatalogCardDetail;
  related: CatalogCardSummary[];
  locale: string;
  total: number;
  wishlistAction?: ReactNode;
};

export async function WikiPersonalizedCardDetail(props: DetailProps) {
  const collection = await getWikiCollection();
  return <WikiCardDetail {...props} collection={collection} />;
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="size-6">
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V6a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function WikiCardDetail({ card, related, locale, total, collection, wishlistAction }: DetailProps & { collection: WikiCollection | null }) {
  const RARITY_SEAL = useRaritySeals();
  const t = useTranslations("wiki");
  const tRarity = useTranslations("rarity");
  const tRole = useTranslations("wiki.roles");
  const state = collection ? wikiCardState(collection, card.anilistId) : null;
  const discovered = state?.discovered === true;
  const series = seriesTitle(card.series, locale);
  const otherTitle = [card.series.titleRomaji, card.series.titleEnglish].find(
    (title) => title && title.toLowerCase() !== series.toLowerCase(),
  );
  const status = !state
    ? t(collection ? "collectionUnavailableShort" : "collectionLoading")
    : state.copies > 0
      ? t("copies", { count: state.copies })
      : state.discovered ? t("discoveredWithoutCopies") : t("notObtained");
  const row = (label: string, value: ReactNode) => (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <dt className="shrink-0 text-xs text-text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm font-medium text-text">{value}</dd>
    </div>
  );
  const forms = card.variantOf ? [card.variantOf] : card.variants;
  const cardLink = (other: CatalogCardSummary) => {
    const otherState = collection ? wikiCardState(collection, other.anilistId) : null;
    const known = otherState?.discovered === true;
    const relatedStatus = !otherState ? t("collectionUnavailableShort") : known ? t("discovered") : t("toDiscover");
    const name = known ? [other.name, other.formName].filter(Boolean).join(" · ") : "???";
    return (
      <li key={other.anilistId} className="min-w-0">
        <Link href={`/wiki/${other.anilistId}`} aria-label={`${name} · ${tRarity(other.rarity)} · ${relatedStatus}`} className="flex min-h-24 items-center gap-3 lacquer rounded-card p-3 transition-colors hover:bg-surface-2">
          <div aria-hidden="true" className="relative aspect-[5/7] w-12 shrink-0 overflow-hidden rounded-md border border-border bg-surface-2">
            <Image src={other.imageUrl} alt="" fill sizes="48px" className={`object-cover object-top${known ? "" : " grayscale"}`} />
            {!known && <span className="absolute inset-0 flex items-center justify-center bg-bg/70 font-title text-3xl font-bold text-text">?</span>}
          </div>
          <div aria-hidden="true" className="min-w-0">
            <p className="truncate text-sm font-bold text-text">{name}</p>
            <p className="mt-1 text-[11px] leading-4 text-text-muted">{tRarity(other.rarity)} · {relatedStatus}</p>
          </div>
        </Link>
      </li>
    );
  };

  return (
    <article className="wiki-content flex min-w-0 flex-col gap-8" aria-busy={collection === null}>
      <header className="relative isolate overflow-hidden lacquer rounded-card px-5 py-6 md:px-8 md:py-8">
        {card.nameNative && (
          <span aria-hidden="true" lang="ja" className="pointer-events-none absolute inset-y-0 right-0 -z-10 flex max-w-full items-center whitespace-nowrap font-title text-[clamp(5rem,12vw,10rem)] font-bold text-text/[0.045]">
            {card.nameNative}
          </span>
        )}
        <nav aria-label={t("breadcrumb")} className="mb-6 flex flex-wrap items-center gap-2 text-xs text-text-muted">
          <Link href="/wiki" className="inline-flex min-h-11 items-center text-text-muted underline-offset-4 hover:text-text hover:underline">{t("title")}</Link>
          <span aria-hidden="true">/</span>
          <span>{series}</span>
          <span aria-hidden="true">/</span>
          <span className="text-text">{card.name}</span>
        </nav>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-bold">
          <span className="rounded-control bg-shu-btn px-3 py-1.5 text-white">{series}</span>
          <span className="inline-flex items-center gap-1.5 rounded-control border border-border bg-bg px-3 py-1.5 text-text">
            <span aria-hidden="true" className="font-seal">{RARITY_SEAL[card.rarity]}</span>{tRarity(card.rarity)}
          </span>
          {card.formName && <span className="rounded-control border border-kin px-3 py-1.5 text-kin">{card.formName}</span>}
          <span role="status" className="rounded-control border border-border bg-bg px-3 py-1.5 text-text-muted">{status}</span>
        </div>
        <h1 className="break-words text-4xl font-extrabold leading-tight md:text-6xl">{card.name}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-text-muted">
          {card.nameNative && <p lang="ja" className="font-title text-base">{card.nameNative}</p>}
          <p className="font-mono text-xs">{t("number", { number: cardNumber(card.rank) })}{card.rank !== null && ` / ${total.toLocaleString(locale)}`}</p>
        </div>
        {card.status === "ARCHIVED" && <p className="mt-4 text-sm font-medium text-text">{t("outOfCatalog")}</p>}
        {wishlistAction && <div className="mt-5">{wishlistAction}</div>}
      </header>

      {collection && !collection.available && (
        <p role="status" className="rounded-control border border-border bg-surface p-4 text-sm text-text-muted">{t("collectionUnavailable")}</p>
      )}

      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8">
        <aside aria-label={t("cardSummary")} className="order-first min-w-0 lacquer rounded-card p-4 lg:order-last">
          <FudaTurnover rarity={card.rarity} className="mx-auto w-full max-w-[260px]">
            <Fuda card={card} series={series} size="lg" monochrome={!discovered} preload />
          </FudaTurnover>
          <p className="mt-4 text-sm font-bold text-text">{tRarity(card.rarity)} · {status}</p>
          <dl className="mt-3">
            {card.nameNative && row(t("nativeName"), <span lang="ja">{card.nameNative}</span>)}
            {row(t("series"), <span className="flex flex-col"><span>{series}</span>{otherTitle && <span className="text-xs font-normal text-text-muted">{otherTitle}</span>}</span>)}
            {card.rank !== null && row(t("rank"), t("rankOf", { rank: card.rank, total }))}
            {card.role && row(t("role"), tRole(card.role as "MAIN" | "SUPPORTING" | "BACKGROUND"))}
            {row(t("favorites"), t("favoritesValue", { count: card.favorites }))}
            {row(t("power"), <span><span aria-hidden="true" className="font-seal">力</span> {card.power}</span>)}
            {row(t("ki"), <span><span aria-hidden="true" className="font-seal">気</span> {card.ki}</span>)}
          </dl>
          {card.sourceAnilistId && <a href={`https://anilist.co/character/${card.sourceAnilistId}`} rel="noopener noreferrer" target="_blank" className="mt-3 inline-flex min-h-11 items-center text-sm text-link underline underline-offset-4">
            {t("viewOnAnilist")}
          </a>}
        </aside>

        <div className="flex min-w-0 flex-col gap-8">
          {discovered ? (
            <Suspense fallback={<WikiBiographySkeleton />}>
              <WikiBiography anilistId={card.sourceAnilistId} description={card.description} locale={locale} />
            </Suspense>
          ) : (
            <section aria-labelledby="wiki-locked-title" className="relative overflow-hidden rounded-card border border-dashed border-text-muted/50 bg-surface p-5 md:p-7">
              <div className="mb-4 flex size-12 items-center justify-center rounded-card border border-border bg-bg text-text"><LockIcon /></div>
              <h2 id="wiki-locked-title" className="text-2xl font-extrabold md:text-3xl">{t("lockedTitle")}</h2>
              <p className="mt-3 max-w-lg text-sm leading-7 text-text-muted">{t("lockedDescription", { name: card.name })}</p>
              <ButtonLink href="/" variant="primary" className="mt-5 w-fit">{t("openBooster")}</ButtonLink>
              <div aria-hidden="true" className="pointer-events-none mt-7 select-none space-y-3 blur-[3px]">
                {["w-full", "w-full", "w-5/6", "w-3/5"].map((width, i) => <div key={i} className={`h-2.5 rounded-full bg-text-muted/20 ${width}`} />)}
              </div>
            </section>
          )}

          <WikiCardValuation />

          {forms.length > 0 && (
            <section aria-labelledby="wiki-forms-title" className="min-w-0">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-text-muted">{t("formsKicker")}</p>
              <h2 id="wiki-forms-title" className="text-2xl font-extrabold md:text-3xl">{card.variantOf ? t("baseFormTitle") : t("formsTitle", { name: card.name })}</h2>
              <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{forms.map(cardLink)}</ul>
            </section>
          )}

          {related.length > 0 && (
            <section aria-labelledby="wiki-related-title" className="min-w-0">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-text-muted">{t("sameUniverse")}</p>
              <h2 id="wiki-related-title" className="text-2xl font-extrabold md:text-3xl">{t("relatedTitle", { series })}</h2>
              <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{related.map(cardLink)}</ul>
            </section>
          )}
        </div>
      </div>
    </article>
  );
}
