import type { BattleEvent, BattleState } from "./types";

// État affiché pendant qu'on anime des événements : chaque événement porte les PV après coup, on
// avance donc pas à pas depuis l'état précédent. À la fin de la file, l'état du serveur fait foi.

export function applyEvent(state: BattleState, e: BattleEvent): BattleState {
  const next = structuredClone(state);
  switch (e.t) {
    case "turn":
      next.active = e.side;
      next.turn = e.turn;
      next.orbs = e.orbs;
      break;
    case "damage":
    case "heal":
    case "poison":
      next.fighters[e.side][e.index].hp = e.hp;
      break;
    case "revive":
      next.fighters[e.side][e.index].hp = e.hp;
      next.fighters[e.side][e.index].revived = true;
      break;
    case "ko":
      Object.assign(next.fighters[e.side][e.index], { hp: 0, barrier: false, sealed: false, poisonTurns: 0, buffTurns: 0, actionsLeft: 0 });
      break;
    case "block":
      next.fighters[e.side][e.index].barrier = false;
      break;
    case "barrier":
      next.fighters[e.side][e.index].barrier = true;
      break;
    case "poisoned":
      next.fighters[e.side][e.index].poisonTurns = Math.max(1, next.fighters[e.side][e.index].poisonTurns);
      break;
    case "seal":
      next.fighters[e.side][e.index].sealed = true;
      break;
    case "buff":
      for (const f of next.fighters[e.side]) if (f.hp > 0) Object.assign(f, { buffPct: e.pct, buffTurns: Math.max(f.buffTurns, 1) });
      break;
    case "end":
      next.finished = true;
      next.winner = e.winner;
      next.endReason = e.reason;
      break;
    default:
      break;
  }
  return next;
}

/** Durée d'affichage d'un événement, en ms (0 avec prefers-reduced-motion). */
export function eventDuration(e: BattleEvent, reduced: boolean): number {
  if (reduced) return 0;
  switch (e.t) {
    case "attack":
      return 380;
    case "damage":
    case "heal":
    case "poison":
    case "block":
      return 320;
    case "ko":
    case "revive":
      return 520;
    case "turn":
      return 450;
    case "end":
      return 0;
    default:
      return 220;
  }
}
