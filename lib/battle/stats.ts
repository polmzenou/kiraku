import type { Rarity } from "@/lib/catalog/rarity";
import { mixSeed, seededRng, type Rng } from "@/lib/rng";
import type { BattleRules } from "./config";
import type { Kit } from "./loadout";
import { teamSynergy } from "./synergy";
import {
  KEYWORDS,
  LEGACY_KEYWORDS,
  LEGACY_TECHNIQUES,
  LEGACY_ULTIMATES,
  NEW_KEYWORDS,
  NEW_TECHNIQUES,
  type BattleSetup,
  type FighterSetup,
  type Keyword,
  type Side,
  type Technique,
  type Ultimate,
  type UniverseRef,
} from "./types";

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
const NEW_KEYWORD_SALT = 0x6e6b; // « nk »
const NEW_TECHNIQUE_SALT = 0x6e74; // « nt »
const ULTIMATE_SALT = 0x756c; // « ul »

/** Emplacements de passif d'une rareté : fixés par battle.keywordsByRarity, l'atelier n'en ajoute jamais. */
export function keywordSlots(rarity: Rarity, perRarity: BattleRules["keywordsByRarity"]): number {
  return Math.min(perRarity[rarity] ?? 0, LEGACY_KEYWORDS.length);
}

/**
 * Passifs d'une carte : toujours les mêmes pour un personnage donné, leur nombre dépend de la rareté.
 * Le tirage historique porte sur les seuls passifs d'origine, à l'identique. Chaque emplacement a ensuite
 * `newAbilityPct` % de chances de recevoir une nouveauté. Les tirages ne dépendent pas de ce réglage :
 * le monter ne fait qu'ajouter des remplacements, sans changer ceux qui existent déjà.
 */
export function keywordsFor(anilistId: number, rarity: Rarity, perRarity: BattleRules["keywordsByRarity"], newAbilityPct = 0): Keyword[] {
  const count = keywordSlots(rarity, perRarity);
  const rng = seededRng(mixSeed(anilistId, KEYWORD_SALT));
  const pool: Keyword[] = [...LEGACY_KEYWORDS];
  const picked: Keyword[] = [];
  for (let i = 0; i < count; i++) picked.push(pool.splice(rng(pool.length), 1)[0]);

  const swap = seededRng(mixSeed(anilistId, NEW_KEYWORD_SALT));
  const fresh: Keyword[] = [...NEW_KEYWORDS];
  const novelties = NEW_KEYWORDS.map(() => fresh.splice(swap(fresh.length), 1)[0]);
  const final = picked.map((keyword, slot) => {
    const roll = swap(100);
    return roll < newAbilityPct && slot < novelties.length ? novelties[slot] : keyword;
  });
  // Ordre canonique : l'affichage ne dépend pas du tirage
  return final.sort((a, b) => KEYWORDS.indexOf(a) - KEYWORDS.indexOf(b));
}

/** Technique d'une carte : le tirage historique, ou une nouveauté dans `newAbilityPct` % des cas. */
export function techniqueFor(anilistId: number, newAbilityPct = 0): Technique {
  const swap = seededRng(mixSeed(anilistId, NEW_TECHNIQUE_SALT));
  const roll = swap(100);
  const novelty = NEW_TECHNIQUES[swap(NEW_TECHNIQUES.length)];
  return roll < newAbilityPct ? novelty : LEGACY_TECHNIQUES[mixSeed(anilistId, TECHNIQUE_SALT) % LEGACY_TECHNIQUES.length];
}

/**
 * Ulti d'une carte : toujours le même pour un personnage, indépendant de son kit d'atelier ; null hors des
 * raretés cochées (battle.ultimateRarities). Le tirage porte sur les seuls ultis d'origine : des ajouts
 * futurs seront tirés à part, sans changer celui-ci.
 */
export function ultimateFor(anilistId: number, rarity: Rarity, rules: Pick<BattleRules, "ultimateRarities">): Ultimate | null {
  if (!rules.ultimateRarities.includes(rarity)) return null;
  return LEGACY_ULTIMATES[mixSeed(anilistId, ULTIMATE_SALT) % LEGACY_ULTIMATES.length];
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
  universe?: UniverseRef;
};

/**
 * `kit` : passifs et technique choisis à l'atelier (lib/battle/loadout.ts) ; sans lui, le tirage de la carte.
 * L'ulti ne dépend que du personnage et de sa rareté, avec ou sans kit.
 */
export function fighterFrom(card: FighterCard, rules: BattleRules, kit?: Kit): FighterSetup {
  const ultimate = ultimateFor(card.anilistId, card.rarity, rules);
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
    keywords: kit ? [...kit.keywords] : keywordsFor(card.anilistId, card.rarity, rules.keywordsByRarity, rules.newAbilityPct),
    technique: kit ? kit.technique : techniqueFor(card.anilistId, rules.newAbilityPct),
    ...(ultimate ? { ultimate } : {}),
    ...(card.universe ? { universe: card.universe } : {}),
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
  const pct = rules.synergyAtkPct ?? 0;
  const synergy = [teamSynergy(teams[0], pct), teamSynergy(teams[1], pct)] as NonNullable<BattleSetup["synergy"]>;
  return { teams, first: first ?? firstSide(teams, rng), rules, ...(synergy[0] || synergy[1] ? { synergy } : {}) };
}
