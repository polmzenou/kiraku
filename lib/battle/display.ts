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
    case "raise":
      // Relevée par un ulti : la Renaissance reste telle quelle
      next.fighters[e.side][e.index].hp = e.hp;
      break;
    case "ultimate": {
      Object.assign(next.fighters[e.side][e.actor], { charge: 0, ultUsed: true });
      // Rempart absolu retire aussi le poison : les barrières suivent, chacune avec son événement
      if (e.ultimate === "FUDO") for (const f of next.fighters[e.side]) if (f.hp > 0) f.poisonTurns = 0;
      break;
    }
    case "ko":
      Object.assign(next.fighters[e.side][e.index], { hp: 0, barrier: false, sealed: false, poisonTurns: 0, buffTurns: 0, actionsLeft: 0 });
      break;
    case "synergy_break":
      if (next.synergy) next.synergy[e.side] = false;
      break;
    case "orbs":
      next.orbs = e.orbs;
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
