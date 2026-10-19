"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Fuda } from "@/components/fuda/Fuda";
import { TEAM_SIZE } from "@/lib/battle/types";
import type { CandidateCard } from "@/lib/battle/view";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/**
 * Choix d'équipe dans une feuille qui monte du bas : 3 emplacements fixés en haut, la collection
 * disponible en grille, le bouton de validation toujours visible. La dernière équipe est pré-remplie.
 */
export function TeamPicker({
  open,
  onClose,
  candidates,
  initial,
  confirmLabel,
  pending,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  candidates: readonly CandidateCard[];
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
  const shown = useMemo(() => {
    const q = fold(query.trim());
    return q ? candidates.filter((c) => fold(`${c.name} ${c.nameNative ?? ""}`).includes(q)) : candidates;
  }, [candidates, query]);

  const toggle = (id: string) =>
    setTeam((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < TEAM_SIZE ? [...cur, id] : cur));

  return (
    <Sheet open={open} onClose={onClose} title={t("title")} wide>
      <p className="text-sm text-text-muted">{t("hint")}</p>

      {/* Emplacements, collés en haut pendant le défilement */}
      <div className="sticky top-12 z-10 -mx-4 grid grid-cols-3 gap-2 bg-bg px-4 py-2 md:-mx-6 md:px-6">
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
              <span aria-hidden="true" className="absolute top-0 right-0 flex size-6 items-center justify-center rounded-bl-md bg-sumi/85 text-sm text-washi-paper">
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

      <label className="flex flex-col gap-1 text-sm">
        <span className="sr-only">{t("search")}</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          className="min-h-11 rounded-control border border-border bg-surface px-3"
        />
      </label>

      {candidates.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface p-4 text-center text-sm text-text-muted">{t("none")}</p>
      ) : shown.length === 0 ? (
        <p className="text-center text-sm text-text-muted">{t("noMatch")}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 md:grid-cols-5">
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
                    <span className="text-shu">
                      {tk(`techniques.${c.technique}.name`)}
                    </span>
                    {c.keywords.map((k) => (
                      <span key={k} className="rounded-sm bg-surface-2 px-0.5">
                        {tk(`keywords.${k}.name`)}
                      </span>
                    ))}
                  </span>
                  {picked && (
                    <span aria-hidden="true" className="absolute top-1 left-1 flex size-6 items-center justify-center rounded-full bg-kin text-xs font-bold text-sumi">
                      {team.indexOf(c.cardId) + 1}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

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
