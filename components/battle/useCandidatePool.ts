"use client";

import { useCallback, useEffect, useState } from "react";
import type { CandidateCard } from "@/lib/battle/view";
import { teamCandidatesAction, type BattleActionError } from "@/server/actions/battle";
import { useBattleError } from "./useBattleError";

// Action qui lève (serveur injoignable, panne) : erreur traduite au lieu d'un écran d'erreur
const UNAVAILABLE = { ok: false, error: "UNAVAILABLE" } as const;

/** Cartes du choix d'équipe : en cours de chargement, refusées (avec un nouvel essai), ou prêtes avec la dernière équipe. */
export type CandidatePool =
  | { status: "loading" }
  | { status: "error"; error: string; retry: () => void }
  | { status: "ready"; candidates: readonly CandidateCard[]; lastTeam: readonly string[] };

/**
 * Charge les cartes du choix d'équipe à la première ouverture du sélecteur (`wanted`), puis les garde pour les
 * ouvertures suivantes : les pages du combat n'envoient plus jusqu'à 500 cartes à chaque affichage ni à chaque
 * rafraîchissement.
 */
export function useCandidatePool(wanted: boolean): CandidatePool {
  const errorText = useBattleError();
  const [loaded, setLoaded] = useState<{ candidates: CandidateCard[]; lastTeam: string[] } | null>(null);
  const [failure, setFailure] = useState<BattleActionError | null>(null);
  // Sélecteur rouvert après un refus : nouvel essai d'office
  const [wasWanted, setWasWanted] = useState(wanted);
  if (wanted !== wasWanted) {
    setWasWanted(wanted);
    if (wanted) setFailure(null);
  }

  useEffect(() => {
    if (!wanted || loaded || failure) return;
    let cancelled = false;
    void teamCandidatesAction()
      .catch(() => UNAVAILABLE)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setLoaded({ candidates: res.candidates, lastTeam: res.lastTeam });
        else setFailure(res.error);
      });
    return () => {
      cancelled = true;
    };
  }, [failure, loaded, wanted]);

  const retry = useCallback(() => setFailure(null), []);
  if (loaded) return { status: "ready", ...loaded };
  if (failure) return { status: "error", error: errorText(failure), retry };
  return { status: "loading" };
}
