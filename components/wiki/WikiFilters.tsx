"use client";

import { useRarities, useRaritySeals } from "@/lib/catalog/use-rarities";

import { useTranslations, type Messages } from "next-intl";
import { useEffect, useId, useOptimistic, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { useRouter } from "@/i18n/navigation";
import { type Rarity } from "@/lib/catalog/rarity";
import { normalizeSearch, SEARCH_MAX_LENGTH } from "@/lib/catalog/search";
import {
  parseWikiParams,
  wikiQuery,
  WIKI_DEFAULT_DIR,
  WIKI_DEMOGRAPHICS,
  WIKI_GENDERS,
  WIKI_OWNERSHIPS,
  WIKI_SORTS,
  type WikiFilterOptions,
  type WikiParams,
} from "@/lib/catalog/wiki-params";
import { chipClasses } from "../ui/Chip";
import { inputClass, selectClass } from "../ui/Field";

const DEBOUNCE_MS = 300;
const chip = (active: boolean) => chipClasses(active);
const radio = (active: boolean) => `${chip(active)} cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-text`;

/** Filtres combinables, comme dans la collection ; l'URL porte aussi le tri et la pagination. */
export function WikiFilters({ params, options, counts, action }: {
  params: WikiParams;
  options: WikiFilterOptions;
  counts: Record<Rarity, number>;
  action: string;
}) {
  const RARITIES = useRarities();
  const RARITY_SEAL = useRaritySeals();
  const t = useTranslations("wiki");
  const tRarity = useTranslations("rarity");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filters, setFilters] = useOptimistic(params);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [seriesSearch, setSeriesSearch] = useState("");
  const [search, setSearch] = useState(params.q);
  const [previousQuery, setPreviousQuery] = useState(params.q);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const id = useId();

  // Une navigation (y compris précédent/suivant) resynchronise le champ sans perdre son focus.
  if (previousQuery !== params.q) {
    setPreviousQuery(params.q);
    setSearch(params.q);
  }
  useEffect(() => () => clearTimeout(timer.current), [params.q]);

  function go(next: Partial<WikiParams>) {
    clearTimeout(timer.current);
    const updated = { ...filters, q: search.trim(), ...next, after: null };
    startTransition(() => {
      setFilters(updated);
      router.replace({ pathname: "/wiki", query: wikiQuery(updated) }, { scroll: false });
    });
  }

  function reset() {
    setSearch("");
    setSeriesSearch("");
    go(parseWikiParams({}));
  }

  const genreLabel = (genre: string) => {
    const key = `genres.${genre as keyof Messages["wiki"]["genres"]}` as const;
    return t.has(key) ? t(key) : genre;
  };
  const activeFilters = [
    ...(filters.series ? [{ key: "series" as const, label: `${t("series")} : ${options.series.find((s) => s.id === filters.series)?.title ?? filters.series}` }] : []),
    ...(filters.demographic ? [{ key: "demographic" as const, label: `${t("demographic")} : ${t(`demographics.${filters.demographic}`)}` }] : []),
    ...(filters.genre ? [{ key: "genre" as const, label: `${t("genre")} : ${genreLabel(filters.genre)}` }] : []),
    ...(filters.gender ? [{ key: "gender" as const, label: `${t("gender")} : ${t(`genders.${filters.gender}`)}` }] : []),
  ];
  const filterCount = activeFilters.length + filters.rarities.length + Number(filters.ownership !== "all");
  const sortChanged = filters.sort !== "number" || filters.dir !== WIKI_DEFAULT_DIR.number;
  const canReset = Boolean(search || filterCount || sortChanged);
  const seriesTerms = normalizeSearch(seriesSearch).split(" ").filter(Boolean);
  const visibleSeries = options.series.filter((series) =>
    series.id === filters.series || seriesTerms.every((term) => normalizeSearch(series.title).includes(term)),
  );

  return (
    <div className="flex min-w-0 flex-col gap-3" aria-busy={pending}>
      <form
        role="search"
        action={action}
        method="get"
        onSubmit={(event) => {
          event.preventDefault();
          go({ q: search.trim() });
        }}
        className="flex gap-2"
      >
        <label htmlFor={`${id}-q`} className="sr-only">{t("searchLabel")}</label>
        <input
          id={`${id}-q`}
          name="q"
          type="search"
          value={search}
          maxLength={SEARCH_MAX_LENGTH}
          placeholder={t("searchPlaceholder")}
          autoComplete="off"
          enterKeyHint="search"
          onChange={(event) => {
            const value = event.currentTarget.value;
            setSearch(value);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => go({ q: value.trim() }), DEBOUNCE_MS);
          }}
          className={`${inputClass} flex-1`}
        />
        {Object.entries(wikiQuery({ ...filters, q: "", after: null })).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <Button type="button" onClick={() => setSheetOpen(true)} aria-haspopup="dialog" className="shrink-0 px-3 sm:px-4">
          {t("sortAndFilters")}
          {filterCount > 0
            ? <span className="flex size-5 items-center justify-center rounded-full bg-shu-btn text-xs text-washi-paper">{filterCount}</span>
            : sortChanged && <span aria-hidden="true" className="size-2 rounded-full bg-shu" />}
        </Button>
      </form>

      <div role="group" aria-label={t("rarityFilter")} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        <button type="button" aria-pressed={filters.rarities.length === 0} onClick={() => go({ rarities: [] })} className={chip(filters.rarities.length === 0)}>
          {t("allRarities")}
        </button>
        {[...RARITIES].reverse().map((rarity) => {
          const active = filters.rarities.includes(rarity);
          return (
            <button
              key={rarity}
              type="button"
              aria-pressed={active}
              onClick={() => go({ rarities: active ? filters.rarities.filter((r) => r !== rarity) : RARITIES.filter((r) => r === rarity || filters.rarities.includes(r)) })}
              className={chip(active)}
            >
              <span aria-hidden="true" className="font-seal text-base">{RARITY_SEAL[rarity]}</span>
              {tRarity(rarity)}
              <span className="tabular-nums text-text-muted">{counts[rarity]}</span>
            </button>
          );
        })}
      </div>

      <div role="group" aria-label={t("ownershipFilter")} className="flex flex-wrap gap-2">
        {WIKI_OWNERSHIPS.map((ownership) => (
          <button key={ownership} type="button" aria-pressed={filters.ownership === ownership} onClick={() => go({ ownership })} className={chip(filters.ownership === ownership)}>
            {t(`ownership.${ownership}`)}
          </button>
        ))}
      </div>

      {activeFilters.length > 0 && (
        <div role="group" aria-label={t("activeFilters")} className="flex flex-wrap gap-2">
          {activeFilters.map(({ key, label }) => (
            <button key={key} type="button" onClick={() => go({ [key]: null })} aria-label={t("removeFilter", { filter: label })} className={`${chip(true)} max-w-full`}>
              <span className="truncate">{label}</span>
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-text-muted">
        <p>{t("sortSummary", { sort: t(`sorts.${filters.sort}`), direction: t(`dirs.${filters.sort}.${filters.dir}`) })}</p>
        {canReset && <button type="button" onClick={reset} className="inline-flex min-h-11 items-center text-link underline underline-offset-4">{t("resetFilters")}</button>}
      </div>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={t("sortAndFilters")}>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-bold">{t("sortBy")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {WIKI_SORTS.map((sort) => (
              <label key={sort} className={radio(filters.sort === sort)}>
                <input type="radio" name={`${id}-sort`} value={sort} checked={filters.sort === sort} onChange={() => go({ sort, dir: WIKI_DEFAULT_DIR[sort] })} className="sr-only" />
                {t(`sorts.${sort}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-bold">{t("direction")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["desc", "asc"] as const).map((dir) => (
              <label key={dir} className={radio(filters.dir === dir)}>
                <input type="radio" name={`${id}-dir`} value={dir} checked={filters.dir === dir} onChange={() => go({ dir })} className="sr-only" />
                {t(`dirs.${filters.sort}.${dir}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex min-w-0 flex-col gap-2">
          <label htmlFor={`${id}-series`} className="text-sm font-bold">{t("series")}</label>
          <label htmlFor={`${id}-series-search`} className="sr-only">{t("searchSeries")}</label>
          <input
            id={`${id}-series-search`}
            type="search"
            value={seriesSearch}
            maxLength={SEARCH_MAX_LENGTH}
            onChange={(event) => setSeriesSearch(event.target.value)}
            placeholder={t("searchSeries")}
            autoComplete="off"
            className={inputClass}
          />
          <select id={`${id}-series`} value={filters.series ?? ""} onChange={(event) => go({ series: event.target.value || null })} className={selectClass}>
            <option value="">{t("allSeries")}</option>
            {visibleSeries.map((series) => <option key={series.id} value={series.id}>{t("seriesOption", { title: series.title, count: series.cards })}</option>)}
          </select>
          {visibleSeries.length === 0 && <p role="status" className="text-sm text-text-muted">{t("noSeries")}</p>}
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-bold">{t("demographic")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {([null, ...WIKI_DEMOGRAPHICS] as const).map((demographic) => (
              <label key={demographic ?? "all"} className={radio(filters.demographic === demographic)}>
                <input type="radio" name={`${id}-demographic`} value={demographic ?? ""} checked={filters.demographic === demographic} onChange={() => go({ demographic })} className="sr-only" />
                {demographic ? t(`demographics.${demographic}`) : t("allDemographics")}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex min-w-0 flex-col gap-2">
          <label htmlFor={`${id}-genre`} className="text-sm font-bold">{t("genre")}</label>
          <select id={`${id}-genre`} value={filters.genre ?? ""} onChange={(event) => go({ genre: event.target.value || null })} className={selectClass}>
            <option value="">{t("allGenres")}</option>
            {[...options.genres].sort((a, b) => genreLabel(a).localeCompare(genreLabel(b))).map((genre) => <option key={genre} value={genre}>{genreLabel(genre)}</option>)}
          </select>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-bold">{t("gender")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {([null, ...WIKI_GENDERS] as const).map((gender) => (
              <label key={gender ?? "all"} className={radio(filters.gender === gender)}>
                <input type="radio" name={`${id}-gender`} value={gender ?? ""} checked={filters.gender === gender} onChange={() => go({ gender })} className="sr-only" />
                {gender ? t(`genders.${gender}`) : t("allGenders")}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-border bg-bg px-4 pt-3 md:-mx-6 md:px-6">
          {canReset && <Button type="button" onClick={reset} className="px-3">{t("resetFilters")}</Button>}
          <Button type="button" variant="primary" onClick={() => setSheetOpen(false)} className="flex-1">{t("done")}</Button>
        </div>
      </Sheet>
    </div>
  );
}
