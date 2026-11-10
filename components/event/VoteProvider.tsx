"use client";

import { useTranslations } from "next-intl";
import { createContext, useContext, useOptimistic, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { clearShowcaseVoteAction, voteShowcaseEntryAction, type ShowcaseEventResult } from "@/server/actions/showcase-event";

// Vote de l'event vitrines : un seul vote par joueur, partagé par tous les boutons de la page. Mis à jour
// tout de suite (optimiste), puis confirmé par le serveur (rafraîchissement de la page).

type VoteState = {
  vote: string | null;
  pending: boolean;
  error: { entryId: string; message: string } | null;
  cast: (entryId: string | null, from: string) => void;
};

const VoteContext = createContext<VoteState | null>(null);

export function VoteProvider({ initial, children }: { initial: string | null; children: ReactNode }) {
  const t = useTranslations("event.errors");
  const [vote, setVote] = useOptimistic(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<VoteState["error"]>(null);

  function cast(entryId: string | null, from: string) {
    setError(null);
    startTransition(async () => {
      setVote(entryId);
      let result: ShowcaseEventResult;
      try {
        result = entryId ? await voteShowcaseEntryAction({ entryId }) : await clearShowcaseVoteAction({});
      } catch {
        result = { ok: false, error: "UNAVAILABLE" };
      }
      if (!result.ok) setError({ entryId: from, message: t(result.error) });
    });
  }

  return <VoteContext.Provider value={{ vote, pending, error, cast }}>{children}</VoteContext.Provider>;
}

/** « Voter pour [pseudo] », ou « Ton vote » et « Retirer mon vote » si c'est la vitrine choisie. */
export function VoteButton({ entryId, name }: { entryId: string; name: string }) {
  const t = useTranslations("event.vote");
  const state = useContext(VoteContext);
  if (!state) return null;
  const chosen = state.vote === entryId;
  const error = state.error?.entryId === entryId ? state.error.message : null;
  return (
    <div className="flex flex-col gap-2">
      {chosen ? (
        <div className="flex flex-wrap items-center gap-2">
          <span role="status" className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-kin/60 bg-kin/10 px-5 text-sm font-bold text-kin">
            <span aria-hidden="true" lang="ja" className="font-seal">
              選
            </span>
            {t("voted")}
          </span>
          <Button variant="ghost" onClick={() => state.cast(null, entryId)} disabled={state.pending}>
            {t("clear")}
          </Button>
        </div>
      ) : (
        <Button variant="primary" className="self-start" onClick={() => state.cast(entryId, entryId)} disabled={state.pending}>
          {t("for", { name })}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm font-bold text-shu">
          {error}
        </p>
      )}
    </div>
  );
}
