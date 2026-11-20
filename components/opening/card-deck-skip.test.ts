import { describe, expect, it } from "vitest";
import { BASE_DEFINITIONS } from "@/lib/catalog/definitions";
import { atLeastRarity } from "@/lib/catalog/tiers";
import { revealOrder, skipTarget } from "./CardDeck";

// Passage rapide de la pile : droit à la première Mythique ou mieux (AR, Gold…) ; une Légendaire ne compte pas.

const big = (rarity: string) => atLeastRarity(rarity, "MYTHIC", BASE_DEFINITIONS);
// Ordre du registre (AR et Gold compris), comme la pile le reçoit de useRarities
const REGISTRY = [...BASE_DEFINITIONS].sort((a, b) => a.sortOrder - b.sortOrder).map((d) => d.key);
const deck = (...rarities: string[]) => revealOrder(rarities.map((rarity, i) => ({ rarity, id: i })), REGISTRY);

describe("passage rapide vers la grande carte", () => {
  it("saute toutes les cartes, Légendaires comprises, jusqu'à la première Mythique", () => {
    const order = deck("LEGENDARY", "COMMON", "MYTHIC", "UNCOMMON", "COMMON", "RARE", "LEGENDARY");
    const at = skipTarget(order, 0, big);
    expect(order[at].rarity).toBe("MYTHIC");
    expect(order.slice(0, at).every((c) => !big(c.rarity))).toBe(true);
  });

  it("ne propose rien pour un pack dont la meilleure carte est une Légendaire", () => {
    expect(skipTarget(deck("COMMON", "COMMON", "RARE", "EPIC", "LEGENDARY"), 0, big)).toBe(-1);
  });

  it("garde la même cible quand on a déjà retourné quelques cartes, et l'AR ou la Gold comptent aussi", () => {
    const order = deck("COMMON", "COMMON", "COMMON", "COMMON", "COMMON", "AR");
    expect(skipTarget(order, 1, big)).toBe(5);
    expect(order[5].rarity).toBe("AR");
  });

  it("ne propose rien sans grande carte, ni quand il reste trop peu de cartes avant elle", () => {
    expect(skipTarget(deck("COMMON", "RARE", "EPIC", "UNCOMMON"), 0, big)).toBe(-1);
    const order = deck("COMMON", "COMMON", "MYTHIC");
    expect(skipTarget(order, 0, big)).toBe(-1);
    expect(skipTarget(order, 0, big, 2)).toBe(2);
    // Déjà sur la grande carte : rien à sauter
    expect(skipTarget(deck("COMMON", "COMMON", "COMMON", "MYTHIC"), 3, big)).toBe(-1);
  });
});
