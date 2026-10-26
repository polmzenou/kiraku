import { seededRng } from "@/lib/rng";
import { botAction } from "./bot";
import { applyAction, createState, legalActions, outcome } from "./engine";
import { fighter, RULES, setupOf } from "./fixtures";
import type { Action, BattleSetup, Side } from "./types";

// Parties bot contre bot des tests de robustesse (aucune base requise). Les 2 000 parties sont
// réparties sur plusieurs fichiers *.sim.test.ts pour tourner en parallèle.

/** Partie complète bot contre bot, avec erreurs volontaires pour varier les coups. */
export function botGame(seed: number, setup: BattleSetup) {
  const rng = seededRng(seed ^ 0x5eed);
  let { state } = createState(setup);
  const actions: Action[] = [];
  for (let guard = 0; !state.finished && guard < 2_000; guard++) {
    const side = state.active;
    const legal = legalActions(setup, state, side);
    const action = botAction(setup, state, side, rng, 30);
    // Vérifications à la main (expect dans une boucle de 100 000 coups est trop lent)
    const key = JSON.stringify(action);
    if (!legal.some((a) => JSON.stringify(a) === key)) throw new Error(`coup illégal du bot : ${key}`);
    actions.push(action);
    state = applyAction(setup, seed, state, action).state;
    for (const team of state.fighters) for (const f of team) {
      if (f.hp < 0 || f.hp > f.maxHp) throw new Error(`PV hors bornes : ${f.hp}/${f.maxHp}`);
    }
  }
  return { state, actions };
}

export function randomTeam(rng: (n: number) => number) {
  const keywords = ["TAUNT", "BARRIER", "FLURRY", "POISON", "RIPOSTE", "LAST_WILL", "REVIVE"] as const;
  const techniques = ["ISSEN", "KANTSU", "RANBU", "IYASHI", "SHUGO", "KOBU", "FUIN"] as const;
  return Array.from({ length: 3 }, () =>
    fighter({
      power: 40 + rng(61),
      ki: 30 + rng(57),
      keywords: [...new Set(Array.from({ length: rng(3) }, () => keywords[rng(keywords.length)]))],
      technique: techniques[rng(techniques.length)],
    }),
  );
}

/**
 * Joue les parties [from, to[ de la série de 2 000 (graine 2026). Les équipes des parties
 * précédentes sont tirées sans être jouées : chaque tranche garde les mêmes parties qu'une série unique.
 * Lève une erreur à la première partie fautive.
 */
export function playBotGames(from: number, to: number): number {
  const rng = seededRng(2026);
  let played = 0;
  for (let i = 0; i < to; i++) {
    const setup = setupOf(randomTeam(rng), randomTeam(rng), RULES, rng(2) as Side);
    if (i < from) continue;
    const { state } = botGame(i, setup);
    if (!state.finished) throw new Error(`partie ${i} non terminée`);
    if (state.turn > RULES.maxTurns) throw new Error(`partie ${i} : ${state.turn} tours (max ${RULES.maxTurns})`);
    const o = outcome(setup, state);
    if (state.endReason === "KO" && state.winner !== null && o[state.winner === 0 ? 1 : 0].hpLeft !== 0) {
      throw new Error(`partie ${i} : K.O. annoncé mais le perdant a encore des PV`);
    }
    played++;
  }
  return played;
}
