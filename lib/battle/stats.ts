import type { Rarity } from "@/lib/catalog/rarity";
import { mixSeed, seededRng, type Rng } from "@/lib/rng";
import type { BattleRules } from "./config";
import { KEYWORDS, TECHNIQUES, type BattleSetup, type FighterSetup, type Keyword, type Side, type Technique } from "./types";

// Ce qu'une carte devient en combat : stats dérivées de 力/気, passifs et technique stables.

/** ATK = 力, DEF = 気, PV = hpBase + 気 × hpPerKiPct / 100, VIT = moyenne des deux. */
export function combatStats(power: number, ki: number, s: BattleRules["stats"]) {
  return {
    atk: power,
    def: ki,
    hp: s.hpBase + Math.floor((ki * s.hpPerKiPct) / 100),
    spd: Math.floor((power + ki) / 2),
  };
}

const KEYWORD_SALT = 0x6b77; // « kw »
const TECHNIQUE_SALT = 0x7463; // « tc »

/** Passifs d'une carte : toujours les mêmes pour un personnage donné, leur nombre dépend de la rareté. */
export function keywordsFor(anilistId: number, rarity: Rarity, perRarity: BattleRules["keywordsByRarity"]): Keyword[] {
  const count = Math.min(perRarity[rarity] ?? 0, KEYWORDS.length);
  const rng = seededRng(mixSeed(anilistId, KEYWORD_SALT));
  const pool: Keyword[] = [...KEYWORDS];
  const picked: Keyword[] = [];
  for (let i = 0; i < count; i++) picked.push(pool.splice(rng(pool.length), 1)[0]);
  // Ordre canonique : l'affichage ne dépend pas du tirage
  return picked.sort((a, b) => KEYWORDS.indexOf(a) - KEYWORDS.indexOf(b));
}

export function techniqueFor(anilistId: number): Technique {
  return TECHNIQUES[mixSeed(anilistId, TECHNIQUE_SALT) % TECHNIQUES.length];
}

export type FighterCard = {
  id: string;
  appearance?: unknown;
  anilistId: number;
  name: string;
  nameNative: string | null;
  imageUrl: string;
  rank: number | null;
  rarity: Rarity;
  power: number;
  ki: number;
};

export function fighterFrom(card: FighterCard, rules: BattleRules): FighterSetup {
  return {
    cardId: card.id,
    anilistId: card.anilistId,
    name: card.name,
    nameNative: card.nameNative,
    imageUrl: card.imageUrl,
    appearance: card.appearance,
    rank: card.rank,
    rarity: card.rarity,
    power: card.power,
    ki: card.ki,
    ...combatStats(card.power, card.ki, rules.stats),
    keywords: keywordsFor(card.anilistId, card.rarity, rules.keywordsByRarity),
    technique: techniqueFor(card.anilistId),
  };
}

/** Le camp le plus rapide commence ; à vitesse égale, le hasard tranche. */
export function firstSide(teams: [FighterSetup[], FighterSetup[]], rng: Rng): Side {
  const speed = (team: FighterSetup[]) => team.reduce((s, f) => s + f.spd, 0);
  const [a, b] = [speed(teams[0]), speed(teams[1])];
  if (a !== b) return a > b ? 0 : 1;
  return rng(2) as Side;
}

/** `first` impose le camp qui commence (contre un bot : toujours le joueur). */
export function buildSetup(teams: [FighterSetup[], FighterSetup[]], rules: BattleSetup["rules"], rng: Rng, first?: Side): BattleSetup {
  return { teams, first: first ?? firstSide(teams, rng), rules };
}
