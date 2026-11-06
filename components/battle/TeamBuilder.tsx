"use client";

import { useTranslations } from "next-intl";
import { useMemo, type ReactNode } from "react";
import { Fuda } from "@/components/fuda/Fuda";
import { teamSynergy } from "@/lib/battle/synergy";
import { TEAM_SIZE } from "@/lib/battle/types";
import type { CandidateCard } from "@/lib/battle/view";
import { Button } from "../ui/Button";
import { chipClasses } from "../ui/Chip";
import { AbilityLists, type AbilityRules } from "./AbilityGuide";
import { CardFilters, useCardFilters } from "./CardFilters";
import { StaticFilament } from "./stage/SynergyFilament";
import { VirtualCardGrid } from "./VirtualCardGrid";

/** Ajoute ou retire une carte de l'équipe, sans dépasser sa taille. */
export const toggleTeam = (team: string[], id: string) =>
  team.includes(id) ? team.filter((x) => x !== id) : team.length < TEAM_SIZE ? [...team, id] : team;

/**
 * Composition d'une équipe, contrôlée par le parent : 3 emplacements fixés en haut, tri et filtres,
 * la collection en grille et le lexique des capacités en barre latérale. Partagée par le choix d'équipe
 * d'un combat et l'édition d'un deck.
 */
export function TeamBuilder({
  candidates,
  abilities,
  team,
  onToggle,
  above,
  extra = [],
}: {
  candidates: readonly CandidateCard[];
  abilities: AbilityRules;
  team: readonly string[];
  onToggle: (cardId: string) => void;
  /** Au-dessus des emplacements (raccourcis, nom du deck). */
  above?: ReactNode;
  /** Cartes de decks absentes de `candidates` : affichables dans les emplacements, pas dans la grille. */
  extra?: readonly CandidateCard[];
}) {
  const t = useTranslations("battle.team");
  const tk = useTranslations("battle");
  const ts = useTranslations("battle.synergy");
  const byId = useMemo(() => new Map([...extra, ...candidates].map((c) => [c.cardId, c])), [candidates, extra]);
  // Sans carte dans l'équipe, « même univers » n'a pas de référence : le filtre attend la première
  const anchor = team[0] ? byId.get(team[0])?.universe : undefined;
  const filters = useCardFilters(candidates, anchor);
  const { shown } = filters;

  const synergy = useMemo(() => teamSynergy(team.flatMap((id) => byId.get(id) ?? []), abilities.synergyAtkPct), [team, byId, abilities.synergyAtkPct]);

  const inTeam = useMemo(() => {
    const cards = team.flatMap((id) => byId.get(id) ?? []);
    return {
      keywords: new Set(cards.flatMap((c) => c.keywords)),
      techniques: new Set(cards.map((c) => c.technique)),
      ultimates: new Set(cards.flatMap((c) => (c.ultimate ? [c.ultimate] : []))),
    };
  }, [team, byId]);

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6">
      <div className="flex min-w-0 flex-col gap-4">
        {above}

        {/* Emplacements, collés en haut pendant le défilement */}
        <div className="sticky top-12 z-10 -mx-4 bg-bg px-4 py-2 md:-mx-6 md:px-6 lg:mx-0 lg:px-0">
          <div className="relative grid max-w-md grid-cols-3 gap-2">
            {synergy && <StaticFilament />}
            {Array.from({ length: TEAM_SIZE }, (_, i) => {
              const card = team[i] ? byId.get(team[i]) : undefined;
              return card ? (
                <button
                  key={card.cardId}
                  type="button"
                  onClick={() => onToggle(card.cardId)}
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
          {abilities.synergyAtkPct > 0 && (
            <p className={`mt-2 max-w-md text-xs ${synergy ? "font-bold text-shu" : "text-text-muted"}`}>
              {synergy ? ts("preview", { universe: synergy.name, pct: synergy.atkPct }) : ts("hint", { pct: abilities.synergyAtkPct })}
            </p>
          )}
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

        <CardFilters filters={filters} />

        {candidates.length === 0 ? (
          <p className="lacquer rounded-card p-4 text-center text-sm text-text-muted">{t("none")}</p>
        ) : shown.length === 0 ? (
          <p className="text-center text-sm text-text-muted">{t("noMatch")}</p>
        ) : (
          // Virtualisée et figée : des centaines de cartes à effets montées d'un coup faisaient planter iOS
          <VirtualCardGrid
            items={shown}
            itemKey={(c) => c.cardId}
            renderItem={(c) => {
              const picked = team.includes(c.cardId);
              const full = !picked && team.length >= TEAM_SIZE;
              return (
                <button
                  type="button"
                  onClick={() => onToggle(c.cardId)}
                  disabled={full}
                  aria-pressed={picked}
                  aria-label={picked ? t("remove", { name: c.name }) : t("add", { name: c.name })}
                  className={`relative flex w-full flex-col gap-1 rounded-[6px] text-left transition-opacity disabled:opacity-40 ${picked ? "opacity-50" : ""}`}
                >
                  <Fuda card={c} size="sm" variant="battle" tilt={false} still sizes="(min-width: 768px) 160px, 30vw" />
                  <span className="flex flex-wrap items-center gap-1 text-[11px] leading-tight">
                    <span className="tabular-nums">{t("stats", { atk: c.power, hp: c.hp })}</span>
                    <span className="text-shu">{tk(`techniques.${c.technique}.name`)}</span>
                    {c.ultimate && <span className="font-bold text-kin">{tk("team.ultimateChip", { name: tk(`ultimates.${c.ultimate}.name`) })}</span>}
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
              );
            }}
          />
        )}
      </div>

      <aside aria-label={t("abilities")} className="sticky top-14 hidden max-h-[calc(92dvh-7rem)] overflow-y-auto overscroll-contain lg:block">
        <AbilityLists rules={abilities} inTeam={inTeam} className="flex flex-col gap-3" />
      </aside>
    </div>
  );
}

/** Barre de validation, toujours visible en bas de la feuille. */
export function TeamConfirmBar({
  count,
  label,
  disabled,
  onConfirm,
  error,
}: {
  count: number;
  label: string;
  disabled: boolean;
  onConfirm: () => void;
  error?: string | null;
}) {
  const t = useTranslations("battle.team");
  return (
    <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-border bg-bg px-4 py-3 md:-mx-6 md:px-6">
      {error && (
        <p role="alert" className="text-sm text-shu">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm tabular-nums text-text-muted">{t("count", { count })}</span>
        <Button variant="primary" disabled={disabled} onClick={onConfirm}>
          {label}
        </Button>
      </div>
    </div>
  );
}
