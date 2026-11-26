"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { sameTeam } from "@/lib/battle/decks";
import { teamSynergy } from "@/lib/battle/synergy";
import { TEAM_SIZE } from "@/lib/battle/types";
import type { DeckView } from "@/lib/battle/view";
import { Button } from "../ui/Button";
import { chipClasses } from "../ui/Chip";
import { Sheet } from "../ui/Sheet";
import type { AbilityRules } from "./AbilityGuide";
import { TeamBuilder, TeamConfirmBar, toggleTeam } from "./TeamBuilder";
import type { CandidatePool } from "./useCandidatePool";

const LINK = "inline-flex min-h-11 items-center self-start text-sm font-bold text-shu underline-offset-4 hover:underline";

/** Raccourcis « Mes decks » : un appui remplit les 3 emplacements. Un deck n'est jamais obligatoire pour jouer. */
function DeckShortcuts({
  decks,
  team,
  synergyAtkPct,
  onPick,
}: {
  decks: readonly DeckView[];
  team: readonly string[];
  synergyAtkPct: number;
  onPick: (cardIds: string[]) => void;
}) {
  const t = useTranslations("battle.decks");
  const ts = useTranslations("battle.synergy");
  if (decks.length === 0) {
    return (
      <Link href="/combat/decks" className={LINK}>
        {t("create")}
      </Link>
    );
  }
  return (
    <div role="group" aria-label={t("title")} className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-text-muted">{t("title")}</span>
        <Link href="/combat/decks" className={LINK}>
          {t("manage")}
        </Link>
      </div>
      <div className="-my-1 flex min-w-0 gap-2 overflow-x-auto py-1">
        {decks.map((deck) => {
          const cardIds = deck.cards.map((c) => c.cardId);
          const active = deck.playable && sameTeam(cardIds, team);
          const synergy = teamSynergy(deck.cards, synergyAtkPct);
          return (
            <button
              key={deck.id}
              type="button"
              aria-pressed={active}
              disabled={!deck.playable}
              onClick={() => onPick(cardIds)}
              className={chipClasses(active, "disabled:pointer-events-none disabled:opacity-50")}
            >
              {synergy && (
                <span role="img" aria-label={ts("deckMark", { universe: synergy.name })} className="size-2 shrink-0 rounded-full bg-shu shadow-[0_0_6px_var(--color-shu)]" />
              )}
              {deck.name}
              {!deck.playable && <span className="text-xs">{t("unavailable")}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Cartes pas encore là (chargées à l'ouverture), ou refusées : à la place de la grille. */
export function PoolPending({ pool }: { pool: Exclude<CandidatePool, { status: "ready" }> }) {
  const t = useTranslations("battle.team");
  if (pool.status === "loading") {
    return (
      <p role="status" className="lacquer rounded-card p-4 text-center text-sm text-text-muted">
        {t("loading")}
      </p>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 lacquer rounded-card p-4 text-center">
      <p role="alert" className="text-sm text-shu">
        {pool.error}
      </p>
      <Button onClick={pool.retry}>{t("retry")}</Button>
    </div>
  );
}

/**
 * Choix d'équipe dans une feuille qui monte du bas (grand écran : large panneau), avec le bouton de
 * validation toujours visible. Les cartes arrivent à l'ouverture (`pool`) ; la dernière équipe est alors
 * pré-remplie, les decks du joueur en un appui.
 */
export function TeamPicker({
  open,
  onClose,
  pool,
  decks,
  abilities,
  confirmLabel,
  pending,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  pool: CandidatePool;
  decks: readonly DeckView[];
  abilities: AbilityRules;
  confirmLabel: string;
  pending: boolean;
  onConfirm: (cardIds: string[]) => void;
}) {
  const t = useTranslations("battle.team");
  const ready = pool.status === "ready" ? pool : null;
  const [team, setTeam] = useState<string[]>(() => (ready ? ready.lastTeam.slice(0, TEAM_SIZE) : []));
  // Cartes arrivées après l'ouverture : la dernière équipe se pré-remplit, sauf si le joueur a déjà choisi
  const [prefilled, setPrefilled] = useState(ready !== null);
  if (ready && !prefilled) {
    setPrefilled(true);
    if (team.length === 0) setTeam(ready.lastTeam.slice(0, TEAM_SIZE));
  }
  const extra = useMemo(() => decks.flatMap((d) => d.cards), [decks]);
  // Raccourcis des decks au-dessus de la grille, une fois les cartes là (leurs emplacements s'affichent avec elle)
  const shortcuts = <DeckShortcuts decks={decks} team={team} synergyAtkPct={abilities.synergyAtkPct} onPick={setTeam} />;

  return (
    <Sheet open={open} onClose={onClose} title={t("title")} wide="xl">
      <p className="text-sm text-text-muted">{t("hint")}</p>

      {pool.status === "ready" ? (
        <TeamBuilder
          candidates={pool.candidates}
          abilities={abilities}
          team={team}
          onToggle={(id) => setTeam((cur) => toggleTeam(cur, id))}
          above={shortcuts}
          extra={extra}
        />
      ) : (
        <PoolPending pool={pool} />
      )}

      <TeamConfirmBar count={team.length} label={confirmLabel} disabled={!ready || team.length !== TEAM_SIZE || pending} onConfirm={() => onConfirm(team)} />
    </Sheet>
  );
}
