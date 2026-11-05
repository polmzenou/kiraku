"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { Fuda } from "@/components/fuda/Fuda";
import { useRouter } from "@/i18n/navigation";
import { cleanDeckName, DECK_NAME_MAX } from "@/lib/battle/decks";
import { TEAM_SIZE } from "@/lib/battle/types";
import type { CandidateCard, DeckView } from "@/lib/battle/view";
import { deleteDeckAction, renameDeckAction, saveDeckAction, type BattleActionError, type DeckResult } from "@/server/actions/battle";
import { Button } from "../ui/Button";
import { inputClass } from "../ui/Field";
import { IconButton } from "../ui/IconButton";
import { Sheet } from "../ui/Sheet";
import type { AbilityRules } from "./AbilityGuide";
import { TeamBuilder, TeamConfirmBar, toggleTeam } from "./TeamBuilder";
import { useBattleError } from "./useBattleError";

// Action qui lève (serveur injoignable, panne) : erreur traduite au lieu d'un écran d'erreur
const UNAVAILABLE = { ok: false, error: "UNAVAILABLE" } as const;

type Sheets = { kind: "EDIT"; deck: DeckView | null } | { kind: "RENAME"; deck: DeckView } | { kind: "DELETE"; deck: DeckView } | null;

function PencilIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5" />
    </svg>
  );
}

/** Mes decks : créer, modifier, renommer et supprimer. Le serveur revérifie tout à l'enregistrement. */
export function DeckManager({
  decks,
  candidates,
  abilities,
  maxDecks,
}: {
  decks: DeckView[];
  candidates: CandidateCard[];
  abilities: AbilityRules;
  maxDecks: number;
}) {
  const t = useTranslations("battle.decks");
  const router = useRouter();
  const battleError = useBattleError();
  const [sheet, setSheet] = useState<Sheets>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const full = decks.length >= maxDecks;
  // battle.errors.NOT_FOUND parle d'une salle de combat
  const errorText = (code: BattleActionError) => (code === "NOT_FOUND" ? t("notFound") : battleError(code));

  const open = (next: Sheets) => {
    setError(null);
    setSheet(next);
  };

  const run = (action: () => Promise<DeckResult>) =>
    startTransition(async () => {
      setError(null);
      const res = await action().catch(() => UNAVAILABLE);
      if (!res.ok) {
        setError(errorText(res.error));
        // Deck supprimé depuis un autre onglet : la liste se remet à jour derrière la feuille
        if (res.error === "NOT_FOUND") router.refresh();
        return;
      }
      setSheet(null);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm tabular-nums text-text-muted">{t("counter", { count: decks.length, max: maxDecks })}</p>
        <Button variant="primary" disabled={full} onClick={() => open({ kind: "EDIT", deck: null })}>
          {t("new")}
        </Button>
      </div>
      {full && <p className="text-sm text-text-muted">{t("limit", { max: maxDecks })}</p>}

      {decks.length === 0 ? (
        <p className="lacquer rounded-card p-4 text-center text-sm text-text-muted">{t("empty")}</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {decks.map((deck) => (
            <li key={deck.id} className="flex min-w-0 flex-col gap-3 lacquer rounded-card p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="min-w-0 truncate font-heading text-lg font-bold">{deck.name}</h2>
                <div className="flex shrink-0 gap-1">
                  <IconButton aria-label={t("rename", { name: deck.name })} onClick={() => open({ kind: "RENAME", deck })}>
                    <PencilIcon />
                  </IconButton>
                  <IconButton aria-label={t("delete", { name: deck.name })} onClick={() => open({ kind: "DELETE", deck })}>
                    <TrashIcon />
                  </IconButton>
                </div>
              </div>
              <button
                type="button"
                aria-label={t("edit", { name: deck.name })}
                onClick={() => open({ kind: "EDIT", deck })}
                className="grid max-w-md grid-cols-3 gap-2 rounded-[6px] text-left active:scale-[.99] motion-reduce:transition-none"
              >
                {deck.cards.map((card) => {
                  const unavailable = deck.unavailable.includes(card.cardId);
                  return (
                    <span key={card.cardId} className="relative block">
                      <span className={`block ${unavailable ? "opacity-40" : ""}`}>
                        <Fuda card={card} size="sm" variant="battle" tilt={false} sizes="(min-width: 768px) 140px, 28vw" />
                      </span>
                      {unavailable && (
                        <span className="absolute inset-x-0 bottom-0 rounded-b-[6px] bg-sumi/85 px-1 py-0.5 text-center text-[11px] font-bold text-washi-paper">
                          {t("unavailable")}
                        </span>
                      )}
                    </span>
                  );
                })}
              </button>
              {!deck.playable && <p className="text-xs text-text-muted">{t("unavailableHint")}</p>}
            </li>
          ))}
        </ul>
      )}

      {sheet?.kind === "EDIT" && (
        <DeckEditor
          deck={sheet.deck}
          decks={decks}
          candidates={candidates}
          abilities={abilities}
          pending={pending}
          error={error}
          onClose={() => setSheet(null)}
          onSave={(name, cardIds) => run(() => saveDeckAction({ deckId: sheet.deck?.id ?? null, name, cardIds }))}
        />
      )}

      {sheet?.kind === "RENAME" && (
        <RenameSheet
          deck={sheet.deck}
          pending={pending}
          error={error}
          onClose={() => setSheet(null)}
          onSave={(name) => run(() => renameDeckAction({ deckId: sheet.deck.id, name }))}
        />
      )}

      {sheet?.kind === "DELETE" && (
        <Sheet open onClose={() => setSheet(null)} title={t("deleteTitle")}>
          <p className="text-sm text-text-muted">{t("deleteText", { name: sheet.deck.name })}</p>
          {error && (
            <p role="alert" className="text-sm text-shu">
              {error}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={pending} onClick={() => setSheet(null)}>
              {t("cancel")}
            </Button>
            <Button variant="danger" disabled={pending} onClick={() => run(() => deleteDeckAction({ deckId: sheet.deck.id }))}>
              {t("confirmDelete")}
            </Button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

/** Nom proposé à la création : le premier « Deck n » libre, traduit ici car le serveur ne génère aucun texte. */
function useDefaultName(decks: readonly DeckView[]) {
  const t = useTranslations("battle.decks");
  const used = new Set(decks.map((d) => d.name));
  let n = decks.length + 1;
  while (used.has(t("defaultName", { n }))) n++;
  return t("defaultName", { n });
}

function DeckEditor({
  deck,
  decks,
  candidates,
  abilities,
  pending,
  error,
  onClose,
  onSave,
}: {
  deck: DeckView | null;
  decks: readonly DeckView[];
  candidates: readonly CandidateCard[];
  abilities: AbilityRules;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (name: string, cardIds: string[]) => void;
}) {
  const t = useTranslations("battle.decks");
  const defaultName = useDefaultName(decks);
  const [name, setName] = useState(deck?.name ?? defaultName);
  const [team, setTeam] = useState<string[]>(() => deck?.cards.map((c) => c.cardId) ?? []);
  const extra = useMemo(() => decks.flatMap((d) => d.cards), [decks]);
  const validName = cleanDeckName(name) !== null;

  return (
    <Sheet open onClose={onClose} title={deck ? t("editTitle") : t("newTitle")} wide="xl">
      <p className="text-sm text-text-muted">{t("editHint")}</p>
      <TeamBuilder
        candidates={candidates}
        abilities={abilities}
        team={team}
        onToggle={(id) => setTeam((cur) => toggleTeam(cur, id))}
        extra={extra}
        above={<NameField value={name} valid={validName} onChange={setName} />}
      />
      <TeamConfirmBar
        count={team.length}
        label={t("save")}
        disabled={team.length !== TEAM_SIZE || !validName || pending}
        onConfirm={() => onSave(name, team)}
        error={error}
      />
    </Sheet>
  );
}

function RenameSheet({
  deck,
  pending,
  error,
  onClose,
  onSave,
}: {
  deck: DeckView;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const t = useTranslations("battle.decks");
  const [name, setName] = useState(deck.name);
  const valid = cleanDeckName(name) !== null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid && !pending) onSave(name);
  };

  return (
    <Sheet open onClose={onClose} title={t("renameTitle")}>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <NameField value={name} valid={valid} onChange={setName} />
        {error && (
          <p role="alert" className="text-sm text-shu">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" disabled={pending} onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={!valid || pending}>
            {t("save")}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

function NameField({ value, valid, onChange }: { value: string; valid: boolean; onChange: (name: string) => void }) {
  const t = useTranslations("battle.decks");
  return (
    <label className="flex flex-col gap-1 text-sm font-bold">
      {t("nameLabel")}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={DECK_NAME_MAX}
        autoComplete="off"
        aria-invalid={!valid}
        className={`${inputClass} font-normal`}
      />
    </label>
  );
}
