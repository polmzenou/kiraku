import { useTranslations } from "next-intl";
import { Fuda } from "@/components/fuda/Fuda";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Link } from "@/i18n/navigation";
import { seriesTitle } from "@/lib/catalog/display";
import { wikiQuery, type WikiParams } from "@/lib/catalog/wiki-params";
import { wikiCardState, type WikiCollection } from "@/lib/catalog/wiki-state";
import type { CatalogCardSummary } from "@/server/catalog/queries";

const gridClasses = "grid grid-cols-3 gap-x-2 gap-y-5 md:grid-cols-4 md:gap-x-3 lg:grid-cols-6 xl:grid-cols-8";

export function WikiGrid({ cards, nextAfter, params, locale, collection, emptyCatalog }: {
  cards: CatalogCardSummary[];
  nextAfter: number | null;
  params: WikiParams;
  locale: string;
  collection: WikiCollection | null;
  emptyCatalog: boolean;
}) {
  const t = useTranslations("wiki");
  const tRarity = useTranslations("rarity");
  return (
    <>
      {collection && !collection.available && (
        <p role="status" className="rounded-control border border-border bg-surface p-3 text-sm text-text-muted">
          {t("collectionUnavailable")}
        </p>
      )}
      {cards.length === 0 ? (
        <p role="status" className="lacquer rounded-card p-6 text-center text-text-muted">
          {emptyCatalog ? t("emptyCatalog") : params.ownership === "owned" ? t("emptyOwned") : t("empty")}
        </p>
      ) : (
        <ul className={gridClasses}>
          {cards.map((card, i) => {
            const state = collection ? wikiCardState(collection, card.anilistId) : null;
            const missing = state?.copies === 0;
            const dimmed = collection?.hasCards && missing;
            const status = state ? state.copies > 0 ? t("copies", { count: state.copies }) : t("missingCard") : "";
            const series = seriesTitle(card.series, locale);
            return (
              <li key={card.anilistId} className="min-w-0">
                <Link
                  href={`/wiki/${card.anilistId}`}
                  aria-label={[card.name, series, tRarity(card.rarity), status].filter(Boolean).join(" · ")}
                  className="group relative flex h-full flex-col gap-2 rounded-[5px] transition-transform active:scale-[0.97]"
                >
                  <div aria-hidden="true" className={dimmed ? "opacity-35 transition-opacity group-hover:opacity-55 group-focus-visible:opacity-55" : ""}>
                    <Fuda card={card} series={series} size="sm" preload={i < 3 && !params.after} describeImage />
                  </div>
                  {missing && collection?.hasCards && (
                    <span aria-hidden="true" className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full border border-text-muted bg-bg text-xs text-text">
                      <span className="size-2 rounded-full border-2 border-current" />
                    </span>
                  )}
                  <div aria-hidden="true" className="flex min-w-0 flex-col gap-0.5 px-0.5">
                    <span className="truncate text-xs font-bold text-text">{card.name}</span>
                    <span className="min-h-4 text-[11px] text-text-muted">{status || "\u00a0"}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {(nextAfter || params.after) && (
        <nav aria-label={t("pagination")} className="flex flex-wrap justify-center gap-3">
          {params.after && (
            <ButtonLink href={{ pathname: "/wiki", query: wikiQuery({ ...params, after: null }) }}>{t("first")}</ButtonLink>
          )}
          {nextAfter && (
            <ButtonLink href={{ pathname: "/wiki", query: wikiQuery({ ...params, after: nextAfter }) }}>{t("next")}</ButtonLink>
          )}
        </nav>
      )}
    </>
  );
}

export function WikiGridSkeleton() {
  const t = useTranslations("wiki");
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">{t("collectionLoading")}</p>
      <ul className={gridClasses} aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => <li key={i} className="aspect-[5/7] animate-pulse rounded-[5px] bg-surface" />)}
      </ul>
    </div>
  );
}
