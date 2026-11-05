import type { Rarity } from "@/lib/catalog/rarity";
import type { BattleRules } from "./config";
import { keywordsFor, keywordSlots, techniqueFor } from "./stats";
import { KEYWORDS, TECHNIQUES, type Keyword, type Technique } from "./types";

// Atelier : passifs et technique choisis par le joueur pour un personnage. Pur, sans base : le serveur lit les
// achats et le kit enregistré (server/battle/kits.ts), ce module décide de ce qui combat.
//
// - Le kit tiré au sort est acquis d'office ; un achat s'y ajoute, pour ce personnage et ce joueur seulement.
// - Le nombre d'emplacements de passif reste celui de la rareté : l'atelier remplace, il n'ajoute jamais.
// - Un emplacement n'est jamais vide : ce qui n'est plus valide ou plus acquis retombe sur le kit d'origine.

export const ABILITY_KINDS = ["KEYWORD", "TECHNIQUE"] as const;
export type AbilityKind = (typeof ABILITY_KINDS)[number];

export type Kit = { keywords: Keyword[]; technique: Technique };
export type OwnedAbilities = { keywords: ReadonlySet<Keyword>; techniques: ReadonlySet<Technique> };
/** Ligne AbilityPurchase ou CardLoadout telle que lue en base : des chaînes, revérifiées ici. */
export type PurchaseRow = { kind: string; ability: string };
export type LoadoutRow = { keywords: readonly string[]; technique: string };

export const isKeyword = (v: string): v is Keyword => (KEYWORDS as readonly string[]).includes(v);
export const isTechnique = (v: string): v is Technique => (TECHNIQUES as readonly string[]).includes(v);

type KitRules = Pick<BattleRules, "keywordsByRarity" | "newAbilityPct">;

/** Kit tiré au sort d'un personnage (`anilistId` = publicId, comme pour le combat). */
export function baseKit(card: { anilistId: number; rarity: Rarity }, rules: KitRules): Kit {
  return {
    keywords: keywordsFor(card.anilistId, card.rarity, rules.keywordsByRarity, rules.newAbilityPct),
    technique: techniqueFor(card.anilistId, rules.newAbilityPct),
  };
}

export const slotsOf = (card: { rarity: Rarity }, rules: Pick<BattleRules, "keywordsByRarity">) => keywordSlots(card.rarity, rules.keywordsByRarity);

/** Capacités acquises : le kit d'origine, plus les achats encore valides (une capacité retirée du jeu est ignorée). */
export function ownedAbilities(base: Kit, purchases: readonly PurchaseRow[]): OwnedAbilities {
  const keywords = new Set<Keyword>(base.keywords);
  const techniques = new Set<Technique>([base.technique]);
  for (const p of purchases) {
    if (p.kind === "KEYWORD" && isKeyword(p.ability)) keywords.add(p.ability);
    if (p.kind === "TECHNIQUE" && isTechnique(p.ability)) techniques.add(p.ability);
  }
  return { keywords, techniques };
}

/**
 * Kit qui combat : le kit choisi, sans ce qui n'est plus valide ou plus acquis ni les doublons, coupé au
 * nombre d'emplacements puis complété par le kit d'origine. Sans kit choisi, le kit d'origine.
 */
export function effectiveKit(base: Kit, loadout: LoadoutRow | null, owned: OwnedAbilities, slots: number): Kit {
  const keywords: Keyword[] = [];
  for (const k of loadout?.keywords ?? []) {
    if (keywords.length < slots && isKeyword(k) && owned.keywords.has(k) && !keywords.includes(k)) keywords.push(k);
  }
  for (const k of base.keywords) if (keywords.length < slots && !keywords.includes(k)) keywords.push(k);
  const chosen = loadout?.technique;
  const technique = chosen !== undefined && isTechnique(chosen) && owned.techniques.has(chosen) ? chosen : base.technique;
  return { keywords, technique };
}

/**
 * Nouveau kit demandé par le joueur : chaque emplacement rempli, sans doublon, avec des capacités acquises.
 * null sinon (le serveur répond BAD_KIT sans rien écrire).
 */
export function checkEquip(next: LoadoutRow, owned: OwnedAbilities, slots: number): Kit | null {
  if (next.keywords.length !== slots || new Set(next.keywords).size !== slots) return null;
  const keywords: Keyword[] = [];
  for (const k of next.keywords) {
    if (!isKeyword(k) || !owned.keywords.has(k)) return null;
    keywords.push(k);
  }
  if (!isTechnique(next.technique) || !owned.techniques.has(next.technique)) return null;
  return { keywords, technique: next.technique };
}

/** Même kit, emplacements dans n'importe quel ordre. */
export function sameKit(a: Kit, b: Kit): boolean {
  return a.technique === b.technique && a.keywords.length === b.keywords.length && a.keywords.every((k) => b.keywords.includes(k));
}

/**
 * La capacité `ability` posée dans l'emplacement `slot` (passif) ou à la place de la technique. null si
 * l'emplacement n'existe pas, ou si le passif est déjà équipé ailleurs.
 */
export function withAbility(kit: Kit, kind: AbilityKind, ability: Keyword | Technique, slot: number): Kit | null {
  if (kind === "TECHNIQUE") return isTechnique(ability) && slot === 0 ? { keywords: [...kit.keywords], technique: ability } : null;
  if (!isKeyword(ability) || !Number.isInteger(slot) || slot < 0 || slot >= kit.keywords.length) return null;
  if (kit.keywords.some((k, i) => k === ability && i !== slot)) return null;
  return { keywords: kit.keywords.map((k, i) => (i === slot ? ability : k)), technique: kit.technique };
}

export type AbilityPrices = BattleRules["abilityPrices"];

/** Prix en vigueur d'une capacité (battle.abilityPrices, complété par les défauts). */
export function abilityPrice(prices: AbilityPrices, kind: AbilityKind, ability: Keyword | Technique): number {
  return kind === "KEYWORD" ? prices.keywords[ability as Keyword] : prices.techniques[ability as Technique];
}
