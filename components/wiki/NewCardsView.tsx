import { useFormatter, useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { BoosterArt } from "@/components/boosters/BoosterArt";
import { NewBadge } from "@/components/catalog/NewBadge";
import { CardBack } from "@/components/fuda/CardBack";
import { Fuda } from "@/components/fuda/Fuda";
import { SectionTitle } from "@/components/SectionTitle";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Link } from "@/i18n/navigation";
import { seriesTitle } from "@/lib/catalog/display";
import type { WikiCardState } from "@/lib/catalog/wiki-state";
import type { CatalogCardSummary } from "@/server/catalog/queries";
import type { ReleaseBooster } from "@/server/catalog/releases";
import "./new-cards.css";

/** Cartes retournées l'une après l'autre ; au-delà, elles se retournent toutes ensemble. */
const STAGGER_MAX = 12;
/** Boosters affichés d'emblée (les plus fournis) ; les autres sont repliés. */
const BOOSTERS_SHOWN = 4;

export type NewCardItem = {
  card: CatalogCardSummary;
  /** Dos premium (Mythique, AR, Gold…) pendant la révélation. */
  premium: boolean;
  /** Noms des boosters du moment qui la contiennent. */
  boosters: string[];
  /** null : collection illisible (la ligne d'état reste vide). */
  state: WikiCardState | null;
  isNew: boolean;
};
export type ReleaseView = { day: string; lastPublishedAt: string; items: NewCardItem[] };

const GRID = "grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-5";
const FUDA_SIZES = "(min-width: 1024px) 220px, (min-width: 640px) 30vw, 50vw";

function CardTile({ item, index, reveal, locale }: { item: NewCardItem; index: number; reveal: boolean; locale: string }) {
  const t = useTranslations("wiki.newCards");
  const tWiki = useTranslations("wiki");
  const tRarity = useTranslations("rarity");
  const { card, state, boosters, isNew } = item;
  const series = seriesTitle(card.series, locale);
  const status = !state ? "" : state.copies > 0 ? t("owned") : t("missing");
  const where = boosters.length === 0 ? t("noBooster") : boosters.length === 1 ? boosters[0] : t("boosterMore", { name: boosters[0], count: boosters.length - 1 });
  const face = (
    <Fuda
      card={card}
      series={series}
      size="sm"
      sizes={FUDA_SIZES}
      preload={reveal && index < 2}
      still={!reveal}
      describeImage
      corner={isNew && <NewBadge />}
    />
  );
  return (
    <li className="min-w-0">
      <Link
        href={`/wiki/${card.anilistId}`}
        aria-label={[[card.name, card.formName].filter(Boolean).join(" · "), series, tRarity(card.rarity), isNew ? tWiki("newLabel") : "", status, where].filter(Boolean).join(" · ")}
        className="group flex h-full flex-col gap-2 rounded-[7px] transition-transform active:scale-[0.97]"
      >
        {reveal ? (
          <div aria-hidden="true" className="nc-scene" style={{ "--nc-i": Math.min(index, STAGGER_MAX) } as CSSProperties}>
            <div className="nc-turn">
              <div className="nc-front">{face}</div>
              <div className="nc-back">
                <CardBack flat premium={item.premium} />
              </div>
            </div>
          </div>
        ) : (
          <div aria-hidden="true">{face}</div>
        )}
        <div aria-hidden="true" className="flex min-w-0 flex-col gap-0.5 px-0.5">
          <span className="truncate text-sm font-bold text-text">{card.name}</span>
          {card.formName && <span className="truncate text-xs text-kin">{card.formName}</span>}
          {status && (
            <span className={`text-[11px] ${state && state.copies > 0 ? "text-text" : "text-text-muted"}`}>
              {state && state.copies > 0 && <span className="text-kin">✓ </span>}
              {status}
            </span>
          )}
          <span className="truncate text-[11px] text-text-muted">{where}</span>
        </div>
      </Link>
    </li>
  );
}

/**
 * Page des nouvelles cartes : la dernière sortie (créations de l'admin publiées le même jour), révélée
 * carte par carte, avec les boosters du moment qui la contiennent ; les sorties précédentes repliées.
 */
export function NewCardsView({ latest, previous, boosters, badgeUntil, timeZone, locale }: {
  latest: ReleaseView | null;
  previous: ReleaseView[];
  boosters: ReleaseBooster[];
  /** Fin du badge « Nouveau » ; null s'il est éteint. */
  badgeUntil: string | null;
  timeZone: string;
  locale: string;
}) {
  const t = useTranslations("wiki.newCards");
  const tWiki = useTranslations("wiki");
  const format = useFormatter();
  const dayOf = (release: ReleaseView) => format.dateTime(new Date(release.lastPublishedAt), { day: "numeric", month: "long", timeZone });
  const boosterRows = (list: ReleaseBooster[], total: number) => (
    <ul className="grid gap-3 md:grid-cols-2">
      {list.map((b) => (
        <li key={b.slug} className="min-w-0">
          <Link
            href={b.href}
            aria-label={`${t("openLabel", { name: b.name })} · ${t("boosterCount", { count: b.count, total })}`}
            className="lacquer flex min-h-20 items-center gap-4 rounded-card p-3 transition-colors hover:bg-surface-2"
          >
            <div className="w-14 shrink-0">
              <BoosterArt shape={b.shape} theme={b.theme} emblem={b.emblem} name={b.name} contents="" compact />
            </div>
            <div aria-hidden="true" className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate font-title text-base font-bold text-text">{b.name}</span>
              <span className="text-xs text-text-muted">{t("boosterCount", { count: b.count, total })}</span>
            </div>
            <span aria-hidden="true" className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-control bg-shu-btn px-4 text-sm font-bold text-washi-paper">
              {t("open")} <span>→</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="wiki-content flex min-w-0 flex-col gap-8">
      <nav aria-label={tWiki("breadcrumb")} className="-mb-4 flex flex-wrap items-center gap-2 text-xs text-text-muted">
        <Link href="/wiki" className="inline-flex min-h-11 items-center text-text-muted underline-offset-4 hover:text-text hover:underline">
          {tWiki("title")}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-text">{t("title")}</span>
      </nav>

      <header className="flex flex-col gap-2">
        <SectionTitle
          level={1}
          kanji="新"
          title={t("title")}
          subtitle={latest ? `${t("release", { date: dayOf(latest) })} · ${t("count", { count: latest.items.length })}` : undefined}
        />
        {badgeUntil && (
          <p className="text-sm font-bold text-shu">
            {t("newUntil", { date: format.dateTime(new Date(badgeUntil), { day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone }) })}
          </p>
        )}
      </header>

      {!latest ? (
        <div className="lacquer flex flex-col items-center gap-4 rounded-card p-6 text-center">
          <p role="status" className="text-text-muted">{t("empty")}</p>
          <ButtonLink href="/wiki">{t("browseWiki")}</ButtonLink>
        </div>
      ) : (
        <>
          <ul aria-label={t("gridLabel", { date: dayOf(latest) })} className={GRID}>
            {latest.items.map((item, i) => (
              <CardTile key={item.card.anilistId} item={item} index={i} reveal locale={locale} />
            ))}
          </ul>

          {boosters.length > 0 && (
            <section aria-labelledby="nc-where" className="flex flex-col gap-4">
              <SectionTitle id="nc-where" title={t("whereTitle")} subtitle={t("whereKicker")} />
              {boosterRows(boosters.slice(0, BOOSTERS_SHOWN), latest.items.length)}
              {boosters.length > BOOSTERS_SHOWN && (
                <details>
                  <summary className="flex min-h-11 cursor-pointer items-center text-sm font-bold text-text-muted hover:text-text">
                    {t("moreBoosters", { count: boosters.length - BOOSTERS_SHOWN })}
                  </summary>
                  <div className="mt-2">{boosterRows(boosters.slice(BOOSTERS_SHOWN), latest.items.length)}</div>
                </details>
              )}
            </section>
          )}
        </>
      )}

      {previous.length > 0 && (
        <section aria-labelledby="nc-previous" className="flex flex-col gap-3">
          <h2 id="nc-previous" className="font-heading text-xl font-extrabold">{t("previous")}</h2>
          {previous.map((release) => (
            <details key={release.day} className="lacquer rounded-card">
              <summary className="flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2 font-bold">
                <span className="min-w-0 flex-1">{t("release", { date: dayOf(release) })}</span>
                <span className="text-xs font-normal text-text-muted">{t("count", { count: release.items.length })}</span>
              </summary>
              <ul className={`${GRID} px-4 pt-2 pb-4`}>
                {release.items.map((item, i) => (
                  <CardTile key={item.card.anilistId} item={item} index={i} reveal={false} locale={locale} />
                ))}
              </ul>
            </details>
          ))}
        </section>
      )}
    </div>
  );
}
