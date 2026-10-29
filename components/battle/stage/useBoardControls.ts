"use client";

import { useMemo, useState } from "react";
import { legalActions } from "@/lib/battle/engine";
import { TECHNIQUE_TARGET, type Action, type BattleSetup, type BattleState, type Side } from "@/lib/battle/types";

export type ControlMode = "ATTACK" | "TECHNIQUE";
export type ControlHint = "waitOpponent" | "noActions" | "pickActor" | "pickAlly" | "pickTarget" | null;

/**
 * Ce que le joueur peut faire sur le plateau (partagé par le direct et le bac à sable) : cartes prêtes,
 * carte choisie, cibles permises (Provocation comprise, via le moteur), et l'action envoyée au toucher.
 * `send` reçoit une action complète du moteur ; le parent n'en transmet que l'intention au serveur.
 */
export function useBoardControls({ setup, shown, mySide, canAct, send }: { setup: BattleSetup; shown: BattleState; mySide: Side; canAct: boolean; send: (a: Action) => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [mode, setMode] = useState<ControlMode>("ATTACK");
  const legal = useMemo(() => (canAct ? legalActions(setup, shown, mySide) : []), [canAct, setup, shown, mySide]);
  const myTurn = !shown.finished && shown.active === mySide;

  const pick = selected !== null && canAct ? selected : null;
  const actorActions = pick === null ? [] : legal.filter((a) => (a.type === "ATTACK" || a.type === "TECHNIQUE") && a.actor === pick);
  const technique = pick === null ? null : setup.teams[mySide][pick].technique;
  const techniqueKind = technique ? TECHNIQUE_TARGET[technique] : null;
  const techniqueActions = actorActions.filter((a) => a.type === "TECHNIQUE");
  const ready = new Set(legal.flatMap((a) => (a.type === "ATTACK" || a.type === "TECHNIQUE" ? [a.actor] : [])));
  const enemyTargets = new Set(
    actorActions.flatMap((a) =>
      mode === "ATTACK" && a.type === "ATTACK" ? [a.target] : mode === "TECHNIQUE" && a.type === "TECHNIQUE" && techniqueKind === "ENEMY" && a.target !== undefined ? [a.target] : [],
    ),
  );
  const allyTargets = new Set(
    mode === "TECHNIQUE" && techniqueKind === "ALLY" ? techniqueActions.flatMap((a) => (a.type === "TECHNIQUE" && a.target !== undefined ? [a.target] : [])) : [],
  );

  const reset = () => {
    setSelected(null);
    setMode("ATTACK");
  };
  const fire = (a: Action) => {
    reset();
    send(a);
  };

  const pressMine = (i: number) => {
    if (!canAct) return;
    if (pick !== null && allyTargets.has(i)) {
      const a = techniqueActions.find((x) => x.type === "TECHNIQUE" && x.target === i);
      if (a) return fire(a);
    }
    if (!ready.has(i)) return;
    setSelected(pick === i ? null : i);
    setMode("ATTACK");
  };
  const pressTheirs = (i: number) => {
    if (!canAct || pick === null || !enemyTargets.has(i)) return;
    const a = actorActions.find((x) => x.type === mode && "target" in x && x.target === i);
    if (a) fire(a);
  };
  const pressTechnique = () => {
    if (pick === null || techniqueActions.length === 0) return;
    if (techniqueKind === "NONE") return fire(techniqueActions[0]);
    setMode(mode === "TECHNIQUE" ? "ATTACK" : "TECHNIQUE");
  };
  const endTurn = () => {
    if (!canAct) return;
    fire({ type: "END_TURN", side: mySide });
  };

  const hint: ControlHint = shown.finished
    ? null
    : !myTurn
      ? "waitOpponent"
      : ready.size === 0
        ? "noActions"
        : pick === null
          ? "pickActor"
          : mode === "TECHNIQUE" && techniqueKind === "ALLY"
            ? "pickAlly"
            : "pickTarget";

  return {
    selected: pick,
    mode,
    setMode,
    ready,
    enemyTargets,
    allyTargets,
    technique,
    cost: technique ? setup.rules.techniques[technique].cost : 0,
    techniqueEnabled: canAct && techniqueActions.length > 0,
    pressMine,
    pressTheirs,
    pressTechnique,
    endTurn,
    hint,
    myTurn,
  };
}
