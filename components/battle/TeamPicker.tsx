"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";
import { Fuda } from "@/components/fuda/Fuda";
import { KEYWORDS, TECHNIQUES, TEAM_SIZE, type Keyword, type Technique } from "@/lib/battle/types";
import type { CandidateCard } from "@/lib/battle/view";
import { Button } from "../ui/Button";
import { chipClasses } from "../ui/Chip";
import { Sheet } from "../ui/Sheet";
import { inputClass } from "../ui/Field";
import { AbilityLists, type AbilityRules } from "./AbilityGuide";

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const SORTS = ["rarity", "atk", "hp", "def"] as const;
type Sort = (typeof SORTS)[number];
// Les candidats arrivent triés par rareté puis force (serveur) : « rarity » garde cet ordre
const SORT_KEY: Record<Exclude<Sort, "rarity">, (c: CandidateCard) => number> = { atk: (c) => c.power, hp: (c) => c.hp, def: (c) => c.ki };

const toggleIn = <T,>(list: readonly T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/**
 * Choix d'équipe dans une feuille qui monte du bas (grand écran : large panneau) : 3 emplacements
 * fixés en haut, tri et filtres, la collection en grille, le lexique des capacités en barre latérale
 * et le bouton de validation toujours visible. La dernière équipe est pré-remplie.
 */
export function TeamPicker({
  open,
  onClose,
  candidates,
  abilities,
  initial,
  confirmLabel,
  pending,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  candidates: readonly CandidateCard[];
  abilities: AbilityRules;
  initial: readonly string[];
  confirmLabel: string;
  pending: boolean;
  onConfirm: (cardIds: string[]) => void;
}) {
  const t = useTranslations("battle.team");
  const tk = useTranslations("battle");
  const [team, setTeam] = useState<string[]>(() => initial.slice(0, TEAM_SIZE));
  const [query, setQuery] = useState("");
  const byId = useMemo(() => new Map(candidates.map((c) => [c.cardId, c])), [candidates]);
  const [sort, setSort] = useState<Sort>("rarity");
  // Passifs : la carte doit tous les avoir ; techniques : l'une d'elles
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [techniques, setTechniques] = useState<Technique[]>([]);
  const filtered = keywords.length > 0 || techniques.length > 0;

  const shown = useMemo(() => {
    const q = fold(query.trim());
    const list = candidates.filter(
      (c) =>
        (!q || fold(`${c.name} ${c.nameNative ?? ""}`).includes(q)) &&
        keywords.every((k) => c.keywords.includes(k)) &&
        (techniques.length === 0 || techniques.includes(c.technique)),
    );
    if (sort === "rarity") return list;
    const key = SORT_KEY[sort];
    return list.sort((a, b) => key(b) - key(a));
  }, [candidates, query, keywords, techniques, sort]);

  const inTeam = useMemo(() => {
    const cards = team.flatMap((id) => byId.get(id) ?? []);
    return {
      keywords: new Set(cards.flatMap((c) => c.keywords)),
      techniques: new Set(cards.map((c) => c.technique)),
    };
  }, [team, byId]);

  const toggle = (id: string) => setTeam((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < TEAM_SIZE ? [...cur, id] : cur));

  return (
    <Sheet open={open} onClose={onClose} title={t("title")} wide="xl">
      <p className="text-sm text-text-muted">{t("hint")}</p>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          {/* Emplacements, collés en haut pendant le défilement */}
          <div className="sticky top-12 z-10 -mx-4 bg-bg px-4 py-2 md:-mx-6 md:px-6 lg:mx-0 lg:px-0">
            <div className="grid max-w-md grid-cols-3 gap-2">
              {Array.from({ length: TEAM_SIZE }, (_, i) => {
                const card = team[i] ? byId.get(team[i]) : undefined;
                return card ? (
                  <button
                    key={card.cardId}
                    type="button"
                    onClick={() => toggle(card.cardId)}
                    aria-label={t("remove", { name: card.name })}
                    className="relative rounded-[6px] active:scale-[0.97] motion-reduce:transition-none"
                  >
                    <Fuda card={card} size="sm" variant="battle" tilt={false} sizes="30vw" />
                    <span
                      aria-hidden="true"
                      className="absolute top-0 right-0 flex size-6 items-center justify-center rounded-bl-md bg-sumi/85 text-sm text-washi-paper"
                    >
                      ×
                    </span>
                  </button>
                ) : (
                  <div
                    key={`empty-${i}`}
                    className="flex aspect-[5/7] items-center justify-center rounded-[6px] border-2 border-dashed border-border text-xs text-text-muted"
                  >
                    {t("slot", { n: i + 1 })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mobile et tablette : le lexique se déplie ici ; grand écran : barre latérale */}
          <details className="group lg:hidden">
            <summary className={chipClasses(false, "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
              {t("abilities")}
              <span aria-hidden="true" className="transition-transform group-open:rotate-180 motion-reduce:transition-none">
                ▾
              </span>
            </summary>
            <AbilityLists rules={abilities} inTeam={inTeam} className="mt-3 grid gap-3 sm:grid-cols-2" />
          </details>

          <label className="flex flex-col gap-1 text-sm">
            <span className="sr-only">{t("search")}</span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} className={inputClass} />
          </label>

          <div className="flex flex-col gap-2">
            <FilterRow label={t("sortLabel")}>
              {SORTS.map((key) => (
                <button key={key} type="button" aria-pressed={sort === key} onClick={() => setSort(key)} className={chipClasses(sort === key)}>
                  {t(`sort.${key}`)}
                </button>
              ))}
            </FilterRow>
            <FilterRow label={t("passives")}>
              {KEYWORDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={keywords.includes(k)}
                  onClick={() => setKeywords((cur) => toggleIn(cur, k))}
                  className={chipClasses(keywords.includes(k))}
                >
                  {tk(`keywords.${k}.name`)}
                </button>
              ))}
            </FilterRow>
            <FilterRow label={t("techniques")}>
              {TECHNIQUES.map((tech) => (
                <button
                  key={tech}
                  type="button"
                  aria-pressed={techniques.includes(tech)}
                  onClick={() => setTechniques((cur) => toggleIn(cur, tech))}
                  className={chipClasses(techniques.includes(tech))}
                >
                  {tk(`techniques.${tech}.name`)}
                </button>
              ))}
            </FilterRow>
            {filtered && (
              <button
                type="button"
                onClick={() => {
                  setKeywords([]);
                  setTechniques([]);
                }}
                className="min-h-11 self-start text-sm font-bold text-shu underline-offset-4 hover:underline"
              >
                {t("resetFilters")}
              </button>
            )}
          </div>

          {candidates.length === 0 ? (
            <p className="lacquer rounded-card p-4 text-center text-sm text-text-muted">{t("none")}</p>
          ) : shown.length === 0 ? (
            <p className="text-center text-sm text-text-muted">{t("noMatch")}</p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
              {shown.map((c) => {
                const picked = team.includes(c.cardId);
                const full = !picked && team.length >= TEAM_SIZE;
                return (
                  <li key={c.cardId}>
                    <button
                      type="button"
                      onClick={() => toggle(c.cardId)}
                      disabled={full}
                      aria-pressed={picked}
                      aria-label={picked ? t("remove", { name: c.name }) : t("add", { name: c.name })}
                      className={`relative flex w-full flex-col gap-1 rounded-[6px] text-left transition-opacity disabled:opacity-40 ${picked ? "opacity-50" : ""}`}
                    >
                      <Fuda card={c} size="sm" variant="battle" tilt={false} sizes="(min-width: 768px) 160px, 30vw" />
                      <span className="flex flex-wrap items-center gap-1 text-[11px] leading-tight">
                        <span className="tabular-nums">{t("stats", { atk: c.power, hp: c.hp })}</span>
                        <span className="text-shu">{tk(`techniques.${c.technique}.name`)}</span>
                        {c.keywords.map((k) => (
                          <span key={k} className="rounded-sm bg-surface-2 px-0.5">
                            {tk(`keywords.${k}.name`)}
                          </span>
                        ))}
                      </span>
                      {picked && (
                        <span
                          aria-hidden="true"
                          className="absolute top-1 left-1 flex size-6 items-center justify-center rounded-full bg-kin text-xs font-bold text-sumi"
                        >
                          {team.indexOf(c.cardId) + 1}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <aside aria-label={t("abilities")} className="sticky top-14 hidden max-h-[calc(92dvh-7rem)] overflow-y-auto overscroll-contain lg:block">
          <AbilityLists rules={abilities} inTeam={inTeam} className="flex flex-col gap-3" />
        </aside>
      </div>

      {/* Validation toujours visible */}
      <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t border-border bg-bg px-4 py-3 md:-mx-6 md:px-6">
        <span className="text-sm tabular-nums text-text-muted">{t("count", { count: team.length })}</span>
        <Button variant="primary" disabled={team.length !== TEAM_SIZE || pending} onClick={() => onConfirm(team)}>
          {confirmLabel}
        </Button>
      </div>
    </Sheet>
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
