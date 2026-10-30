import { describe, expect, it } from "vitest";
import { BASE_DEFINITIONS } from "@/lib/catalog/definitions";
import { isBigMoment } from "@/lib/catalog/tiers";
import { revealOrder, skipTarget } from "./CardDeck";

// Passage rapide de la pile : droit à la première Légendaire ou mieux, ou à la Mythique d'un pack sans Légendaire.

const big = (rarity: string) => isBigMoment(rarity, BASE_DEFINITIONS);
// Ordre du registre (AR et Gold compris), comme la pile le reçoit de useRarities
const REGISTRY = [...BASE_DEFINITIONS].sort((a, b) => a.sortOrder - b.sortOrder).map((d) => d.key);
const deck = (...rarities: string[]) => revealOrder(rarities.map((rarity, i) => ({ rarity, id: i })), REGISTRY);

describe("passage rapide vers la grande carte", () => {
  it("saute toutes les petites cartes jusqu'à la première Légendaire", () => {
    const order = deck("LEGENDARY", "COMMON", "MYTHIC", "UNCOMMON", "COMMON", "RARE", "LEGENDARY");
    const at = skipTarget(order, 0, big);
    expect(order[at].rarity).toBe("LEGENDARY");
    expect(order.slice(0, at).every((c) => !big(c.rarity))).toBe(true);
  });

  it("va droit à la Mythique d'un pack qui n'a pas de Légendaire", () => {
    const order = deck("EPIC", "MYTHIC", "EPIC", "RARE", "EPIC");
    expect(order[skipTarget(order, 0, big)].rarity).toBe("MYTHIC");
  });

  it("garde la même cible quand on a déjà retourné quelques cartes, et l'AR ou la Gold comptent aussi", () => {
    const order = deck("COMMON", "COMMON", "COMMON", "COMMON", "COMMON", "AR");
    expect(skipTarget(order, 1, big)).toBe(5);
    expect(order[5].rarity).toBe("AR");
  });

  it("ne propose rien sans grande carte, ni quand il reste trop peu de cartes avant elle", () => {
    expect(skipTarget(deck("COMMON", "RARE", "EPIC", "UNCOMMON"), 0, big)).toBe(-1);
    const order = deck("COMMON", "COMMON", "LEGENDARY");
    expect(skipTarget(order, 0, big)).toBe(-1);
    expect(skipTarget(order, 0, big, 2)).toBe(2);
    // Déjà sur la grande carte : rien à sauter
    expect(skipTarget(deck("COMMON", "COMMON", "COMMON", "MYTHIC"), 3, big)).toBe(-1);
  });
});
