import type { BattleEvent, BattleState, FighterState, Side } from "./types";

// État affiché pendant qu'on anime des événements : chaque événement porte les PV après coup, on
// avance donc pas à pas depuis l'état précédent. À la fin de la file, l'état du serveur fait foi.
// Copie sur écriture : seul le combattant touché (et son camp) change d'objet, les autres restent les
// mêmes ; l'état reçu n'est jamais modifié, et les cartes intactes ne se redessinent pas.

type Fighters = BattleState["fighters"];

/** Remplace des combattants d'un camp (`patch` reçoit chacun et rend sa version, ou le même objet s'il ne change pas). */
function withSide(state: BattleState, side: Side, patch: (f: FighterState, index: number) => FighterState): BattleState {
  const row = state.fighters[side].map(patch);
  if (row.every((f, i) => f === state.fighters[side][i])) return state;
  const fighters = [...state.fighters] as Fighters;
  fighters[side] = row;
  return { ...state, fighters };
}

const withFighter = (state: BattleState, side: Side, index: number, change: Partial<FighterState>) =>
  withSide(state, side, (f, i) => (i === index ? { ...f, ...change } : f));

export function applyEvent(state: BattleState, e: BattleEvent): BattleState {
  switch (e.t) {
    case "turn":
      return { ...state, active: e.side, turn: e.turn, orbs: e.orbs };
    case "damage":
    case "heal":
    case "poison":
      return withFighter(state, e.side, e.index, { hp: e.hp });
    case "revive":
      return withFighter(state, e.side, e.index, { hp: e.hp, revived: true });
    case "raise":
      // Relevée par un ulti : la Renaissance reste telle quelle
      return withFighter(state, e.side, e.index, { hp: e.hp });
    case "ultimate":
      // Rempart absolu retire aussi le poison : les barrières suivent, chacune avec son événement
      return withSide(state, e.side, (f, i) => {
        const next = i === e.actor ? { ...f, charge: 0, ultUsed: true } : f;
        return e.ultimate === "FUDO" && next.hp > 0 && next.poisonTurns !== 0 ? { ...next, poisonTurns: 0 } : next;
      });
    case "ko":
      return withFighter(state, e.side, e.index, { hp: 0, barrier: false, sealed: false, poisonTurns: 0, buffTurns: 0, actionsLeft: 0 });
    case "synergy_break": {
      if (!state.synergy) return state;
      const synergy = [...state.synergy] as NonNullable<BattleState["synergy"]>;
      synergy[e.side] = false;
      return { ...state, synergy };
    }
    case "orbs":
      return { ...state, orbs: e.orbs };
    case "block":
      return withFighter(state, e.side, e.index, { barrier: false });
    case "barrier":
      return withFighter(state, e.side, e.index, { barrier: true });
    case "poisoned":
      return withFighter(state, e.side, e.index, { poisonTurns: Math.max(1, state.fighters[e.side][e.index].poisonTurns) });
    case "seal":
      return withFighter(state, e.side, e.index, { sealed: true });
    case "buff":
      return withSide(state, e.side, (f) => (f.hp > 0 ? { ...f, buffPct: e.pct, buffTurns: Math.max(f.buffTurns, 1) } : f));
    case "end":
      return { ...state, finished: true, winner: e.winner, endReason: e.reason };
    default:
      return state;
  }
}
