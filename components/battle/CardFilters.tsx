"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";
import { KEYWORDS, TECHNIQUES, type Keyword, type Technique, type UniverseRef } from "@/lib/battle/types";
import type { CandidateCard } from "@/lib/battle/view";
import { chipClasses } from "../ui/Chip";
import { inputClass } from "../ui/Field";

// Recherche, tri et filtres d'une grille de cartes de combat : choix d'équipe, decks et atelier.

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const SORTS = ["rarity", "atk", "hp", "def"] as const;
type Sort = (typeof SORTS)[number];
// Les cartes arrivent triées par rareté puis force (serveur) : « rarity » garde cet ordre
const SORT_KEY: Record<Exclude<Sort, "rarity">, (c: CandidateCard) => number> = { atk: (c) => c.power, hp: (c) => c.hp, def: (c) => c.ki };

const toggleIn = <T,>(list: readonly T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** État des filtres et cartes affichées. `anchor` : univers de référence du filtre « même univers ». */
export function useCardFilters<C extends CandidateCard>(cards: readonly C[], anchor?: UniverseRef) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("rarity");
  // Passifs : la carte doit tous les avoir ; techniques : l'une d'elles
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [techniques, setTechniques] = useState<Technique[]>([]);
  const [sameUniverse, setSameUniverse] = useState(false);
  // Sans carte de référence, « même univers » attend la première
  const universeKey = sameUniverse ? anchor?.key : undefined;

  const shown = useMemo(() => {
    const q = fold(query.trim());
    const list = cards.filter(
      (c) =>
        (!q || fold(`${c.name} ${c.nameNative ?? ""} ${c.universe.name}`).includes(q)) &&
        keywords.every((k) => c.keywords.includes(k)) &&
        (techniques.length === 0 || techniques.includes(c.technique)) &&
        (!universeKey || c.universe.key === universeKey),
    );
    if (sort === "rarity") return list;
    const key = SORT_KEY[sort];
    return list.sort((a, b) => key(b) - key(a));
  }, [cards, query, keywords, techniques, sort, universeKey]);

  return {
    shown,
    query,
    setQuery,
    sort,
    setSort,
    keywords,
    toggleKeyword: (k: Keyword) => setKeywords((cur) => toggleIn(cur, k)),
    techniques,
    toggleTechnique: (t: Technique) => setTechniques((cur) => toggleIn(cur, t)),
    sameUniverse,
    toggleSameUniverse: () => setSameUniverse((on) => !on),
    anchor,
    filtered: keywords.length > 0 || techniques.length > 0 || sameUniverse,
    reset: () => {
      setKeywords([]);
      setTechniques([]);
      setSameUniverse(false);
    },
  };
}

export type CardFilterState = ReturnType<typeof useCardFilters>;

/** Champ de recherche puis lignes de tri et de filtres. `universe` : filtre « même univers » (composition d'équipe). */
export function CardFilters({ filters: f, universe = true }: { filters: CardFilterState; universe?: boolean }) {
  const t = useTranslations("battle.team");
  const tk = useTranslations("battle");
  const ts = useTranslations("battle.synergy");
  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        <span className="sr-only">{t("search")}</span>
        <input type="search" value={f.query} onChange={(e) => f.setQuery(e.target.value)} placeholder={t("search")} className={inputClass} />
      </label>

      <div className="flex flex-col gap-2">
        <FilterRow label={t("sortLabel")}>
          {SORTS.map((key) => (
            <button key={key} type="button" aria-pressed={f.sort === key} onClick={() => f.setSort(key)} className={chipClasses(f.sort === key)}>
              {t(`sort.${key}`)}
            </button>
          ))}
        </FilterRow>
        <FilterRow label={t("passives")}>
          {KEYWORDS.map((k) => (
            <button key={k} type="button" aria-pressed={f.keywords.includes(k)} onClick={() => f.toggleKeyword(k)} className={chipClasses(f.keywords.includes(k))}>
              {tk(`keywords.${k}.name`)}
            </button>
          ))}
        </FilterRow>
        <FilterRow label={t("techniques")}>
          {TECHNIQUES.map((tech) => (
            <button
              key={tech}
              type="button"
              aria-pressed={f.techniques.includes(tech)}
              onClick={() => f.toggleTechnique(tech)}
              className={chipClasses(f.techniques.includes(tech))}
            >
              {tk(`techniques.${tech}.name`)}
            </button>
          ))}
        </FilterRow>
        {universe && (
          <FilterRow label={ts("filterLabel")}>
            <button type="button" aria-pressed={f.sameUniverse} onClick={f.toggleSameUniverse} className={chipClasses(f.sameUniverse)}>
              {f.anchor && f.sameUniverse ? f.anchor.name : ts("sameUniverse")}
            </button>
          </FilterRow>
        )}
        {f.filtered && (
          <button type="button" onClick={f.reset} className="min-h-11 self-start text-sm font-bold text-shu underline-offset-4 hover:underline">
            {t("resetFilters")}
          </button>
        )}
      </div>
    </>
  );
}

/** Une ligne de puces (tri ou filtre) : défile horizontalement sur mobile, passe à la ligne ensuite. */
function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs font-bold text-text-muted">{label}</span>
      <div className="-my-1 flex min-w-0 gap-2 overflow-x-auto py-1 md:flex-wrap md:overflow-visible">{children}</div>
    </div>
  );
}
