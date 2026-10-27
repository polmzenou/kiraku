"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { OPEN_COUNTS, choiceCount, contentsLabel, openAllCount, type OpenChoice } from "@/lib/boosters/catalog";
import type { FilterContext } from "@/lib/boosters/pool-filter";
import { familyRows, firstSelectable, positionInFamily } from "@/lib/boosters/showcase";
import { localize, priceFor, type BoosterFamily } from "@/lib/boosters/types";
import { useRaritySeals } from "@/lib/catalog/use-rarities";
import type { BoosterState } from "@/server/boosters/state";
import { segmentedFillClass, segmentedItemClass, segmentedTrackClass } from "../../ui/Segmented";
import { BoosterArt } from "../BoosterArt";
import { BoosterPanel, CHANCE_ROWS, chanceRows, RARITY_TEXT } from "../BoosterPanel";
import { RARITY_BG, usePercent } from "../format";
import { NextFreeIn } from "../NextFreeIn";
import { OpenLink } from "../OpenLink";
import { RatesSheet } from "../RatesSheet";
import { EndsIn } from "../EndsIn";
import { AllBoostersSheet } from "./AllBoostersSheet";
import { FocusBanner, type FocusAnnouncement } from "./FocusBanner";
import { ShowcaseBackdrop } from "./ShowcaseBackdrop";
import { ShowcaseList } from "./ShowcaseList";
import { BoosterStripTile } from "./ShowcaseRow";
import type { Entry, ShowcaseFamily, ShowcaseItem } from "./types";


/** Nouveau contenu du hero : fondu et léger glissé vers le haut (transform/opacity seulement). */
const FADE_IN = "transition-[opacity,translate] duration-500 ease-out starting:translate-y-1.5 starting:opacity-0 motion-reduce:transition-none";

type Props = {
  items: ShowcaseItem[];
  families: ShowcaseFamily[];
  initial: { slug: string; family: BoosterFamily };
  state: BoosterState;
  ctx: FilterContext;
  /** « Sélection tournante · nouvelle sélection dans 5 h » (familles tournantes). */
  rotationNote: string;
  banner: { slug: string; name: string; days: number | null } | null;
  /** Focus série annoncé entre le titre et la vitrine (le premier activé), ou null. */
  focus: FocusAnnouncement | null;
  /** Titre de la page (rendu par le serveur), à côté de la pastille de la bannière. */
  heading: ReactNode;
};

/**
 * Vitrine de l'accueil (planche « B · Intégrée à l'app ») : un grand hero aux couleurs et au motif du
 * booster choisi, qui se fondent d'un booster à l'autre ; liste avec recherche à droite en desktop,
 * bandeau de la famille et feuille « Tous » en mobile. Le choix se fait sans rechargement, l'URL
 * (?b=&f=) suit pour le partage. Le serveur recalcule tout à l'ouverture.
 */
export function BoosterShowcase({ items, families, initial, state, ctx, rotationNote, banner, focus, heading }: Props) {
  const t = useTranslations("boosters.showcase");
  const tb = useTranslations("boosters");
  const tOpening = useTranslations("opening");
  const tRarity = useTranslations("rarity");
  const RARITY_SEAL = useRaritySeals();
  const format = useFormatter();
  const percent = usePercent();
  const locale = useLocale();

  const entries: Entry[] = useMemo(
    () =>
      items.map((item) => ({
        slug: item.type.slug,
        family: item.type.family,
        name: localize(item.type.name, locale),
        tagline: localize(item.type.tagline, locale),
        selectable: item.selectable,
        item,
      })),
    [items, locale],
  );

  const [slug, setSlug] = useState(initial.slug);
  const [family, setFamily] = useState(initial.family);
  const [query, setQuery] = useState("");
  const [count, setCount] = useState<OpenChoice>(1);
  // Pas de fondu au premier affichage : seulement quand le joueur change de booster
  const [changed, setChanged] = useState(false);
  // Onglets des familles (mobile) : reste-t-il des onglets cachés à droite ?
  const tabsRef = useRef<HTMLUListElement>(null);
  const [moreTabs, setMoreTabs] = useState(false);
  const checkTabs = useCallback(() => {
    const el = tabsRef.current;
    if (el) setMoreTabs(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);
  useEffect(() => {
    checkTabs();
    window.addEventListener("resize", checkTabs);
    return () => window.removeEventListener("resize", checkTabs);
  }, [checkTabs]);

  const selected = entries.find((e) => e.slug === slug && e.selectable) ?? entries.find((e) => e.selectable)!;
  const { type, panel, cards } = selected.item;
  const fam = families.find((f) => f.family === family) ?? families[0];

  // L'URL suit le choix (lien partageable, retour sur la page) sans redemander la page au serveur
  const commit = (nextSlug: string, nextFamily: BoosterFamily) => {
    setSlug(nextSlug);
    setFamily(nextFamily);
    setChanged(true);
    const params = new URLSearchParams(window.location.search);
    params.set("b", nextSlug);
    params.set("f", nextFamily);
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  };
  const select = (nextSlug: string) => {
    const entry = entries.find((e) => e.slug === nextSlug && e.selectable);
    if (entry && entry.slug !== slug) commit(entry.slug, entry.family);
  };
  // Bouton de la bannière Focus : onglet et booster choisis, puis la vitrine vient à l'écran
  const heroRef = useRef<HTMLElement>(null);
  const openFocus = (focusSlug: string) => {
    select(focusSlug);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    heroRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };
  const pickFamily = (next: BoosterFamily) => {
    setQuery("");
    const first = selected.family === next ? selected : firstSelectable(entries, next);
    commit(first?.slug ?? slug, next);
  };

  const position = positionInFamily(entries, selected.slug);
  const selectedFamily = families.find((f) => f.family === selected.family);
  const kicker = position && selectedFamily ? t("kicker", { family: selectedFamily.title, index: position.index, total: position.total }) : "";
  const isBox = type.shape === "JUBAKO";
  const name = selected.name;
  const tagline = selected.tagline;
  const fade = changed ? FADE_IN : "";

  // « Tous » : tout le stock gratuit ; retombe sur ×1 pour un booster sans stock gratuit
  const allCount = openAllCount(type.usesFreeStock ? state.stock : 0);
  const choice: OpenChoice = count === "all" && allCount === 0 ? 1 : count;
  const price = priceFor(type, state.stock, choiceCount(choice, allCount));
  const chipClass = (tone: "hero" | "page") =>
    tone === "hero"
      ? "min-w-11 px-2 text-sm font-bold text-[var(--ink-2)] tabular-nums transition-colors aria-pressed:bg-[var(--ink)] aria-pressed:text-[var(--ink-bg)] disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
      : `${segmentedItemClass} min-w-11 px-2! tabular-nums disabled:cursor-not-allowed disabled:opacity-40`;
  const locked = panel?.availability === "locked";
  const strip = familyRows(entries, family);

  const countPicker = (tone: "hero" | "page") => (
    <fieldset className={tone === "hero" ? "shrink-0" : "w-full"}>
      <legend className="sr-only">{tOpening("count")}</legend>
      <div
        className={
          tone === "hero"
            ? "inline-grid h-14 grid-flow-col overflow-hidden rounded-control border border-[var(--chip-b)] bg-[var(--chip)]"
            : `${segmentedTrackClass} ${segmentedFillClass} h-12`
        }
      >
        {OPEN_COUNTS.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={choice === n}
            disabled={priceFor(type, state.stock, n).kind === "unavailable"}
            onClick={() => setCount(n)}
            className={chipClass(tone)}
          >
            {tOpening("times", { n })}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={choice === "all"}
          aria-label={allCount > 0 ? tOpening("allCount", { n: allCount }) : undefined}
          disabled={allCount === 0}
          onClick={() => setCount("all")}
          className={chipClass(tone)}
        >
          {tOpening("all")}
        </button>
      </div>
    </fieldset>
  );

  const openLink = (className: string) => (
    <OpenLink
      slug={type.slug}
      count={choice}
      price={price}
      availability={panel?.availability ?? "open"}
      stock={state.stock}
      coins={state.coins}
      className={className}
    />
  );

  // Anneau de pitié : la part déjà parcourue vers la Mythique sûre (rien tant qu'aucun booster n'est compté)
  const pityRing = (left: number) => {
    const done = 119.4 * (1 - left / Math.max(state.pityThreshold, 1));
    return (
      <svg width="40" height="40" viewBox="0 0 46 46" aria-hidden="true" className="shrink-0">
        <circle cx="23" cy="23" r="19" fill="none" stroke="var(--track)" strokeWidth="4" />
        {done > 0.5 && (
          <circle
            cx="23"
            cy="23"
            r="19"
            fill="none"
            stroke="var(--ink)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${done.toFixed(1)} 119.4`}
            transform="rotate(-90 23 23)"
          />
        )}
      </svg>
    );
  };

  // Ligne de stat : rangée « libellé · valeur » en mobile, tuile en desktop
  const stat = (label: string, value: ReactNode) => (
    <div className="flex items-baseline justify-between gap-2 border-b border-[var(--chip-b)] pb-1.5 lg:flex-col-reverse lg:items-start lg:justify-end lg:gap-1 lg:rounded-control lg:border lg:bg-[var(--chip)] lg:px-3.5 lg:py-3">
      <dt className="text-xs text-[var(--ink-2)]">{label}</dt>
      <dd className="text-xs font-black tabular-nums lg:font-title lg:text-[1.4rem] lg:leading-none lg:font-extrabold">{value}</dd>
    </div>
  );

  const ratesPanel = (headingId: string) =>
    panel && <BoosterPanel type={type} panel={panel} ctx={ctx} state={state} wishlist={selected.item.wishlist} withOpen={false} headingId={headingId} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        {heading}
        {banner && (
          <button
            type="button"
            onClick={() => select(banner.slug)}
            className="inline-flex min-h-11 items-center gap-2.5 rounded-pill border border-kin/55 bg-[linear-gradient(90deg,#24386a,var(--color-bg)_85%)] py-1 pr-4 pl-1.5 text-left text-[13px] font-bold text-[#f1e9da]"
          >
            <span aria-hidden="true" lang="ja" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#080e20] font-seal text-base text-kin">
              星
            </span>
            <span>
              {t("bannerChip", { name: banner.name })}
              {banner.days !== null && <span className="font-medium text-[#f1e9da]/80"> · {t("bannerEnds", { count: banner.days })}</span>}
            </span>
          </button>
        )}
      </div>

      {focus && <FocusBanner focus={focus} serverNow={state.serverNow} onOpen={() => openFocus(focus.slug)} />}

      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-stretch lg:gap-6">
        <section
          ref={heroRef}
          aria-labelledby="showcase-name"
          data-ink={type.theme.ink}
          className="showcase relative isolate -mx-4 flex min-h-[25rem] scroll-mt-20 flex-col overflow-hidden text-[var(--ink)] lg:mx-0 lg:min-h-[36rem] lg:rounded-hero lg:border lg:border-white/10"
        >
          <ShowcaseBackdrop slug={selected.slug} theme={type.theme} />

          <div className="flex items-stretch border-b border-[var(--chip-b)]">
            <nav aria-label={tb("familiesLabel")} className="relative min-w-0 flex-1">
              <ul
                ref={tabsRef}
                data-swipe-ignore
                onScroll={checkTabs}
                className={`flex overflow-x-auto px-1 [scrollbar-width:none] motion-safe:scroll-smooth lg:grid lg:grid-cols-8 lg:overflow-visible lg:px-2.5 lg:pt-1.5 lg:[mask-image:none] ${
                  moreTabs ? "[mask-image:linear-gradient(90deg,#000_75%,transparent_92%)]" : ""
                }`}
              >
                {families.map((f) => (
                  <li key={f.family} className="shrink-0 lg:min-w-0">
                    <button
                      type="button"
                      aria-pressed={f.family === family && !query.trim()}
                      onClick={() => pickFamily(f.family)}
                      className="relative flex min-h-14 w-full min-w-[4.6rem] flex-col items-center justify-center gap-0.5 px-1.5 text-[11px] font-bold text-[var(--ink-2)] transition-colors hover:text-[var(--ink)] aria-pressed:text-[var(--ink)] aria-pressed:shadow-[inset_0_-3px_0_var(--ink)] motion-reduce:transition-none lg:min-w-0 lg:rounded-t-[10px] lg:text-xs lg:hover:bg-[var(--chip)]"
                    >
                      <span aria-hidden="true" lang="ja" className="font-seal text-[15px] leading-none lg:text-base">
                        {f.kanji}
                      </span>
                      <span className="max-w-full truncate">{f.short}</span>
                      {f.rotating && (
                        <svg
                          role="img"
                          aria-label={t("rotating")}
                          viewBox="0 0 24 24"
                          width="11"
                          height="11"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="absolute top-2 right-2 opacity-80"
                        >
                          <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
                          <path d="M21 3v5h-5" />
                        </svg>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              {/* Mobile : d'autres familles attendent à droite ; la flèche le montre et fait défiler */}
              {moreTabs && (
                <button
                  type="button"
                  aria-label={t("moreFamilies")}
                  onClick={() => tabsRef.current?.scrollBy({ left: tabsRef.current.clientWidth * 0.7 })}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-[var(--ink)] lg:hidden"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                </button>
              )}
            </nav>
            <AllBoostersSheet
              entries={entries}
              families={families}
              selectedSlug={selected.slug}
              stock={state.stock}
              rotationNote={rotationNote}
              onSelect={select}
            />
          </div>

          <div className="grid flex-1 grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-4 px-4 pt-5 pb-8 lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:gap-11 lg:px-12 lg:py-8">
            <div key={`art-${selected.slug}`} className={`flex justify-center ${fade}`}>
              <div className={`-rotate-6 ${isBox ? "w-[8.25rem] lg:w-[15.5rem]" : "w-[8rem] lg:w-[15rem]"}`}>
                <BoosterArt shape={type.shape} theme={type.theme} emblem={type.emblem} name={name} tagline={tagline} contents={contentsLabel(cards)} />
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-3 lg:gap-5">
              <div key={`name-${selected.slug}`} className={fade}>
                <p className="text-[10px] font-bold tracking-[0.16em] text-[var(--ink-2)] uppercase lg:text-xs">{kicker}</p>
                <h2 id="showcase-name" className="mt-0.5 font-heading text-[1.7rem] leading-[1.05] font-extrabold lg:text-5xl">
                  {name}
                </h2>
                <p className="mt-1 text-xs text-[var(--ink-2)] lg:text-[15px]">{tagline}</p>
                {type.endsAt && (
                  <EndsIn
                    key={selected.slug}
                    endsAt={new Date(type.endsAt).getTime()}
                    serverNow={state.serverNow}
                    className="mt-2 rounded-pill border border-[var(--chip-b)] bg-[var(--chip)] px-2.5 py-1 text-[11px] font-bold lg:text-xs"
                  />
                )}
              </div>

              {panel && (
                <dl className="grid gap-1.5 lg:grid-cols-2 lg:gap-2.5">
                  {stat(isBox ? tb("cardsInBox") : tb("cardsPerBooster"), panel.slotFloors.length)}
                  {stat(
                    isBox ? tb("guaranteedBox") : tb("guaranteed"),
                    <>
                      <span aria-hidden="true" lang="ja" className="font-seal font-normal">
                        {RARITY_SEAL[panel.best]}
                      </span>{" "}
                      {tRarity(panel.best)}
                    </>,
                  )}
                  {stat(tb("possible"), format.number(panel.poolSize))}
                  <div className="flex items-center gap-2.5 pt-0.5 lg:rounded-control lg:border lg:border-[var(--chip-b)] lg:bg-[var(--chip)] lg:px-3.5 lg:py-2">
                    {pityRing(panel.pityLeft ?? 0)}
                    <div className="flex flex-col-reverse gap-0.5">
                      <dt className="text-xs text-[var(--ink-2)]">{panel.pityLeft !== null ? t("pity") : tb("noPity")}</dt>
                      <dd className="text-sm font-black tabular-nums lg:font-title lg:text-[1.4rem] lg:leading-none lg:font-extrabold">
                        {panel.pityLeft !== null ? format.number(panel.pityLeft) : "—"}
                      </dd>
                    </div>
                  </div>
                </dl>
              )}

              {/* Desktop : chances et ouverture dans le hero */}
              {panel && (
                <div className="hidden flex-col gap-5 lg:flex">
                  <section aria-labelledby="showcase-odds" className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <h3 id="showcase-odds" className="text-xs font-bold text-[var(--ink-2)]">
                        {tb("chances")}
                      </h3>
                      <RatesSheet
                        label={t("ratesDetailed")}
                        triggerClassName="min-h-11 px-1 text-xs font-bold text-[var(--ink)] underline underline-offset-4"
                      >
                        {ratesPanel("selected-booster-desktop")}
                      </RatesSheet>
                    </div>
                    <ul className="flex flex-col gap-2">
                      {chanceRows(panel.odds).map((r) => (
                        <li key={r} className="grid grid-cols-[8rem_minmax(0,1fr)_3.75rem] items-center gap-3 text-[13px] font-bold">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span aria-hidden="true" lang="ja" className="font-seal">
                              {RARITY_SEAL[r]}
                            </span>
                            <span className="truncate">{tRarity(r)}</span>
                          </span>
                          <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-[var(--track)]">
                            <span className={`block h-full origin-left rounded-full ${RARITY_BG[r]}`} style={{ transform: `scaleX(${Math.max(panel.odds[r], 0.02)})` }} />
                          </span>
                          <span className="text-right tabular-nums">
                            <span className="sr-only">{tb("chanceRow", { rarity: tRarity(r), value: percent(panel.odds[r]) })}</span>
                            <span aria-hidden="true">{percent(panel.odds[r])}</span>
                          </span>
                        </li>
                      ))}
                      {panel.featured && (
                        <li className="grid grid-cols-[8rem_minmax(0,1fr)_3.75rem] items-center gap-3 text-[13px] font-bold">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span aria-hidden="true" lang="ja" className="font-seal text-kin">
                              星
                            </span>
                            <span className="truncate">{tb(panel.featured.focus ? "focusChance" : "featuredChance")}</span>
                          </span>
                          <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-[var(--track)]">
                            <span className="block h-full origin-left rounded-full bg-kin" style={{ transform: `scaleX(${Math.max(panel.featured.chance, 0.02)})` }} />
                          </span>
                          <span className="text-right tabular-nums">
                            <span className="sr-only">{tb(panel.featured.focus ? "focusRow" : "featuredRow", { value: percent(panel.featured.chance) })}</span>
                            <span aria-hidden="true">{percent(panel.featured.chance)}</span>
                          </span>
                        </li>
                      )}
                    </ul>
                  </section>
                  <div className="flex flex-col gap-2">
                    {/* Colonne étroite (tablette, petit desktop) : le bouton passe sous le sélecteur plutôt que d'être écrasé */}
                    <div className="flex flex-wrap gap-2.5">
                      {!locked && countPicker("hero")}
                      {openLink("min-w-56 flex-1")}
                    </div>
                    {type.usesFreeStock && <NextFreeIn nextAt={state.nextAt} serverNow={state.serverNow} className="text-[var(--ink-2)]!" />}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="hidden lg:block">
          <ShowcaseList
            entries={entries}
            families={families}
            family={family}
            query={query}
            onQuery={setQuery}
            selected={selected}
            onSelect={select}
            stock={state.stock}
            rotationNote={rotationNote}
          />
        </aside>

        {/* Mobile : bandeau de la famille, chances, nombre et ouverture sous le hero */}
        <div className="flex flex-col gap-3 lg:hidden">
          <section aria-labelledby="showcase-strip" className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="showcase-strip" className="shrink-0 text-xs font-bold whitespace-nowrap">
                {fam.title}
              </h2>
              <span className="min-w-0 truncate text-[11px] text-text-muted">
                {fam.rotating
                  ? `${t("rotatingCount", { on: strip.on.length, total: strip.on.length + strip.off.length })} · ${rotationNote}`
                  : t("count", { count: strip.on.length })}
              </span>
            </div>
            <ul data-swipe-ignore className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
              {[...strip.on, ...strip.off].map((e) => (
                <li key={e.slug}>
                  <BoosterStripTile entry={e} selected={e.slug === selected.slug} stock={state.stock} onSelect={select} />
                </li>
              ))}
            </ul>
          </section>

          {panel && (
            <div className="lacquer flex min-h-11 items-center gap-2.5 rounded-control py-1 pr-1 pl-3">
              <p className="flex min-w-0 flex-1 justify-between gap-2 text-xs font-black tabular-nums">
                {CHANCE_ROWS.map((r) => (
                  <span key={r} className={`whitespace-nowrap ${RARITY_TEXT[r]}`}>
                    <span aria-hidden="true" lang="ja" className="font-seal">
                      {RARITY_SEAL[r]}
                    </span>
                    <span className="sr-only">{tRarity(r)}</span>
                    {r !== "MYTHIC" && <span aria-hidden="true">+</span>} {percent(panel.odds[r])}
                  </span>
                ))}
              </p>
              <RatesSheet triggerClassName="min-h-11 shrink-0 rounded-[9px] border border-border bg-surface-2 px-3 text-xs font-bold text-text">
                {ratesPanel("selected-booster-sheet")}
              </RatesSheet>
            </div>
          )}

          {/* Sélecteur au-dessus du bouton : quatre choix et « Gratuit · 6 restants » ne tiennent pas côte à côte en 375 px */}
          <div className="flex flex-col gap-2">
            {!locked && countPicker("page")}
            {openLink("")}
          </div>
          {type.usesFreeStock && <NextFreeIn nextAt={state.nextAt} serverNow={state.serverNow} className="text-center" />}
        </div>
      </div>
    </div>
  );
}
