"use client";

import { useMemo, useState } from "react";
import { legalActions } from "@/lib/battle/engine";
import { TECHNIQUE_TARGET, ULTIMATE_TARGET, type Action, type BattleSetup, type BattleState, type Side } from "@/lib/battle/types";

export type ControlMode = "ATTACK" | "TECHNIQUE" | "ULTIMATE";
export type ControlHint = "waitOpponent" | "noActions" | "pickActor" | "pickAlly" | "pickTarget" | "pickFallen" | "confirmUltimate" | null;

type CardAction = Extract<Action, { type: "ATTACK" | "TECHNIQUE" | "ULTIMATE" }>;
const isCardAction = (a: Action): a is CardAction => a.type === "ATTACK" || a.type === "TECHNIQUE" || a.type === "ULTIMATE";

/**
 * Ce que le joueur peut faire sur le plateau (partagé par le direct et le bac à sable) : cartes prêtes,
 * carte choisie, cibles permises (Provocation comprise, via le moteur), et l'action envoyée au toucher.
 * `send` reçoit une action complète du moteur ; le parent n'en transmet que l'intention au serveur.
 * Un ulti sans cible se lance en deux touchers (le premier l'arme) : on ne gâche pas son unique ulti par erreur.
 */
export function useBoardControls({ setup, shown, mySide, canAct, send }: { setup: BattleSetup; shown: BattleState; mySide: Side; canAct: boolean; send: (a: Action) => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [mode, setMode] = useState<ControlMode>("ATTACK");
  const legal = useMemo(() => (canAct ? legalActions(setup, shown, mySide) : []), [canAct, setup, shown, mySide]);
  const myTurn = !shown.finished && shown.active === mySide;

  const pick = selected !== null && canAct ? selected : null;
  const actorActions = pick === null ? [] : legal.filter(isCardAction).filter((a) => a.actor === pick);
  const technique = pick === null ? null : setup.teams[mySide][pick].technique;
  const techniqueKind = technique ? TECHNIQUE_TARGET[technique] : null;
  const techniqueActions = actorActions.filter((a) => a.type === "TECHNIQUE");
  const ultimate = pick === null ? null : (setup.teams[mySide][pick].ultimate ?? null);
  const ultimateKind = ultimate ? ULTIMATE_TARGET[ultimate] : null;
  const ultimateActions = actorActions.filter((a) => a.type === "ULTIMATE");
  const ready = new Set(legal.filter(isCardAction).map((a) => a.actor));

  // Cibles du mode en cours : ennemis (attaque, technique ou ulti offensifs), alliés (soin, protection) ou alliés à terre (Résurrection)
  const targetsOf = (kind: "ENEMY" | "ALLY" | "DEAD_ALLY") =>
    new Set(
      actorActions.flatMap((a) => {
        if (a.type !== mode || a.target === undefined) return [];
        const k = a.type === "ATTACK" ? "ENEMY" : a.type === "TECHNIQUE" ? techniqueKind : ultimateKind;
        return k === kind ? [a.target] : [];
      }),
    );
  const enemyTargets = targetsOf("ENEMY");
  const allyTargets = mode === "ULTIMATE" ? targetsOf("DEAD_ALLY") : targetsOf("ALLY");

  const reset = () => {
    setSelected(null);
    setMode("ATTACK");
  };
  const fire = (a: Action) => {
    reset();
    send(a);
  };
  const actionOn = (i: number) => actorActions.find((x) => x.type === mode && x.target === i);

  const pressMine = (i: number) => {
    if (!canAct) return;
    if (pick !== null && allyTargets.has(i)) {
      const a = actionOn(i);
      if (a) return fire(a);
    }
    if (!ready.has(i)) return;
    setSelected(pick === i ? null : i);
    setMode("ATTACK");
  };
  const pressTheirs = (i: number) => {
    if (!canAct || pick === null || !enemyTargets.has(i)) return;
    const a = actionOn(i);
    if (a) fire(a);
  };
  const pressTechnique = () => {
    if (pick === null || techniqueActions.length === 0) return;
    if (techniqueKind === "NONE") return fire(techniqueActions[0]);
    setMode(mode === "TECHNIQUE" ? "ATTACK" : "TECHNIQUE");
  };
  const pressUltimate = () => {
    if (pick === null || ultimateActions.length === 0) return;
    // Sans cible : le premier toucher arme, le second lance
    if (ultimateKind === "NONE" && mode === "ULTIMATE") return fire(ultimateActions[0]);
    setMode(mode === "ULTIMATE" ? "ATTACK" : "ULTIMATE");
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
          : mode === "ULTIMATE"
            ? ultimateKind === "NONE"
              ? "confirmUltimate"
              : ultimateKind === "DEAD_ALLY"
                ? "pickFallen"
                : "pickTarget"
            : mode === "TECHNIQUE" && techniqueKind === "ALLY"
              ? "pickAlly"
              : "pickTarget";

  const fighter = pick === null ? null : shown.fighters[mySide][pick];
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
    ultimate,
    ultimateCharge: fighter?.charge ?? 0,
    ultimateUsed: Boolean(fighter?.ultUsed),
    ultimateEnabled: canAct && ultimateActions.length > 0,
    /** Ulti sans cible armé : le prochain toucher sur la tablette le lance. */
    ultimateArmed: mode === "ULTIMATE" && ultimateKind === "NONE" && ultimateActions.length > 0,
    pressMine,
    pressTheirs,
    pressTechnique,
    pressUltimate,
    endTurn,
    hint,
    myTurn,
  };
}
