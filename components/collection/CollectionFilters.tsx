"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { RARITIES, RARITY_SEAL, type Rarity } from "@/lib/catalog/rarity";
import { SEARCH_MAX_LENGTH } from "@/lib/catalog/search";
import {
  COLLECTION_SORTS,
  collectionQuery,
  DEFAULT_DIR,
  DEFAULT_PARAMS,
  type CollectionParams,
  type CollectionSort,
} from "@/lib/collection/params";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";

const DEBOUNCE_MS = 300;

const chip = (active: boolean) =>
  `inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-button border px-3 text-sm ${
    active ? "border-text bg-surface-2 font-bold" : "border-border bg-surface text-text-muted"
  }`;

/**
 * Filtres de la collection : recherche, raretés, doublons, puis tri et série dans une feuille.
 * Tout l'état est dans l'URL (le serveur filtre et trie) : un lien filtré se partage tel quel.
 */
export function CollectionFilters({
  params,
  pathname,
  series,
  counts,
}: {
  params: CollectionParams;
  pathname: string;
  series: { id: string; title: string; cards: number }[];
  counts?: Partial<Record<Rarity, number>>;
}) {
  const t = useTranslations("collection");
  const tRarity = useTranslations("rarity");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [sheetOpen, setSheetOpen] = useState(false);
  const searchId = useId();
  const seriesId = useId();

  useEffect(() => () => clearTimeout(timer.current), []);

  function go(next: Partial<CollectionParams>) {
    clearTimeout(timer.current);
    startTransition(() => {
      router.replace({ pathname, query: collectionQuery({ ...params, ...next }) }, { scroll: false });
    });
  }

  const toggleRarity = (r: Rarity) =>
    go({ rarities: params.rarities.includes(r) ? params.rarities.filter((x) => x !== r) : [...params.rarities, r] });

  const currentSeries = series.find((s) => s.id === params.series);
  const sortChanged = params.sort !== DEFAULT_PARAMS.sort || params.dir !== DEFAULT_PARAMS.dir;

  return (
    <div className="flex flex-col gap-3" aria-busy={pending}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: String(new FormData(e.currentTarget).get("q") ?? "").trim() });
        }}
        className="flex gap-2"
      >
        <label htmlFor={searchId} className="sr-only">
          {t("searchLabel")}
        </label>
        <input
          id={searchId}
          name="q"
          type="search"
          defaultValue={params.q}
          maxLength={SEARCH_MAX_LENGTH}
          placeholder={t("searchPlaceholder")}
          autoComplete="off"
          enterKeyHint="search"
          onChange={(e) => {
            const value = e.currentTarget.value.trim();
            clearTimeout(timer.current);
            timer.current = setTimeout(() => go({ q: value }), DEBOUNCE_MS);
          }}
          className="min-h-11 min-w-0 flex-1 rounded-button border border-border bg-surface px-3 text-text placeholder:text-text-muted"
        />
        <Button type="button" onClick={() => setSheetOpen(true)} aria-haspopup="dialog" className="px-4">
          {t("sortAndSeries")}
          {(sortChanged || params.series) && <span aria-hidden="true" className="size-2 rounded-full bg-shu" />}
        </Button>
      </form>

      <div role="group" aria-label={t("rarityFilter")} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        <button type="button" aria-pressed={params.dupes} onClick={() => go({ dupes: !params.dupes })} className={chip(params.dupes)}>
          {t("dupesOnly")}
        </button>
        {[...RARITIES].reverse().map((r) => {
          const active = params.rarities.includes(r);
          return (
            <button key={r} type="button" aria-pressed={active} onClick={() => toggleRarity(r)} className={chip(active)}>
              <span aria-hidden="true" className="font-seal text-base">
                {RARITY_SEAL[r]}
              </span>
              {tRarity(r)}
              {counts?.[r] !== undefined && <span className="tabular-nums text-text-muted">{counts[r]}</span>}
            </button>
          );
        })}
      </div>

      {currentSeries && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-text-muted">{t("seriesActive")}</span>
          <span className="font-bold">{currentSeries.title}</span>
          <button type="button" onClick={() => go({ series: null })} className="inline-flex min-h-11 items-center text-ai underline underline-offset-4">
            {t("clearSeries")}
          </button>
        </p>
      )}

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={t("sortAndSeries")}>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-bold">{t("sortBy")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {COLLECTION_SORTS.map((s: CollectionSort) => (
              <label key={s} className={`${chip(params.sort === s)} cursor-pointer`}>
                <input
                  type="radio"
                  name="sort"
                  value={s}
                  checked={params.sort === s}
                  onChange={() => go({ sort: s, dir: DEFAULT_DIR[s] })}
                  className="sr-only"
                />
                {t(`sorts.${s}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-bold">{t("direction")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["desc", "asc"] as const).map((d) => (
              <label key={d} className={`${chip(params.dir === d)} cursor-pointer`}>
                <input type="radio" name="dir" value={d} checked={params.dir === d} onChange={() => go({ dir: d })} className="sr-only" />
                {t(`dirs.${params.sort}.${d}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <label htmlFor={seriesId} className="text-sm font-bold">
            {t("series")}
          </label>
          <select
            id={seriesId}
            value={params.series ?? ""}
            onChange={(e) => go({ series: e.target.value || null })}
            className="min-h-11 w-full rounded-button border border-border bg-surface-2 px-3 text-base"
          >
            <option value="">{t("allSeries")}</option>
            {series.map((s) => (
              <option key={s.id} value={s.id}>
                {t("seriesOption", { title: s.title, count: s.cards })}
              </option>
            ))}
          </select>
        </div>

        <Button type="button" variant="shu" onClick={() => setSheetOpen(false)}>
          {t("done")}
        </Button>
      </Sheet>
    </div>
  );
}
