import type { Rarity } from "@/lib/catalog/rarity";
import { DEFAULT_BATTLE_RULES, engineRules } from "./config";
import { combatStats } from "./stats";
import type { BattleSetup, EngineRules, FighterSetup, Keyword, Side, Technique } from "./types";

// Cartes et setups de test (aucune base requise).

export const RULES: EngineRules = engineRules(DEFAULT_BATTLE_RULES);

/** Règles sans hasard : pas de critique, aléa fixé à 100 %, premier tour sans limite d'actions. */
export const FLAT_RULES: EngineRules = {
  ...RULES,
  firstTurnActions: 6,
  damage: { critPermille: 0, critPct: 150, varianceMinPct: 100, varianceMaxPct: 100 },
};

let next = 1;

export function fighter(over: Partial<FighterSetup> & { keywords?: Keyword[]; technique?: Technique } = {}): FighterSetup {
  const power = over.power ?? 70;
  const ki = over.ki ?? 50;
  const id = next++;
  return {
    cardId: `card-${id}`,
    anilistId: id,
    name: `Carte ${id}`,
    nameNative: null,
    imageUrl: "https://example.test/c.webp",
    rank: id,
    rarity: "COMMON" as Rarity,
    power,
    ki,
    ...combatStats(power, ki, DEFAULT_BATTLE_RULES.stats),
    keywords: [],
    technique: "ISSEN",
    ...over,
  };
}

export function setupOf(a: FighterSetup[], b: FighterSetup[], rules: EngineRules = FLAT_RULES, first: Side = 0): BattleSetup {
  return { teams: [a, b], first, rules };
}
