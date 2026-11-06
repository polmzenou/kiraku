import { botGame } from "./bot-games";
import { fighter, RULES, setupOf } from "./fixtures";
import type { BattleSetup, EngineRules, FighterSetup, Keyword, Side, Technique, Ultimate } from "./types";

// Équilibrage des capacités : deux équipes identiques, sans passif et avec Éclair (ISSEN). Une seule carte
// du camp testé reçoit la capacité. Camp testé, premier joueur et emplacement tournent : à score égal le
// bot frappe toujours la première carte, et Rafale passe de 72 % à 97 % selon sa place si elle ne bouge pas.
// Un ulti se mesure de même : la même équipe, avec et sans l'ulti sur une carte, jauge vide au départ.
// Pur et déterministe : mêmes paramètres, mêmes chiffres.

export type AbilityLine = { keyword?: Keyword; technique?: Technique; ultimate?: Ultimate };

const base = (over: Partial<FighterSetup> = {}) => fighter({ power: 70, ki: 50, technique: "ISSEN", keywords: [], ...over });

/** Part de victoires du camp testé, parties nulles écartées. */
export function abilityWinRate(line: AbilityLine, games: number, rules: EngineRules = RULES): number {
  let wins = 0;
  let decided = 0;
  for (let i = 0; i < games; i++) {
    const slot = Math.floor(i / 4) % 3;
    const special = {
      ...(line.keyword ? { keywords: [line.keyword] } : {}),
      ...(line.technique ? { technique: line.technique } : {}),
      ...(line.ultimate ? { ultimate: line.ultimate } : {}),
    };
    const tested = [0, 1, 2].map((j) => (j === slot ? base(special) : base()));
    const plain = [base(), base(), base()];
    const side = (i % 4 < 2 ? 0 : 1) as Side;
    const setup: BattleSetup = setupOf(side === 0 ? tested : plain, side === 0 ? plain : tested, rules, (i % 2) as Side);
    const { state } = botGame(i, setup);
    if (state.winner === null) continue;
    decided++;
    if (state.winner === side) wins++;
  }
  return decided === 0 ? 0 : wins / decided;
}

/** Cibles des nouvelles capacités : volontairement sous Rafale et Renaissance. Un ulti pèse comme un bon passif. */
export const BALANCE_TARGETS = {
  keyword: { min: 0.58, max: 0.72 },
  technique: { min: 0.42, max: 0.55 },
  ultimate: { min: 0.58, max: 0.68 },
} as const;
