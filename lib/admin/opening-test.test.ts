import { describe, expect, it } from "vitest";
import { revealOrder } from "@/components/opening/CardDeck";
import type { CardView } from "@/lib/boosters/view";
import { BASE_DEFINITIONS, orderedKeys } from "@/lib/catalog/definitions";
import { testBoosters, type OpeningTestPool } from "./opening-test";

const card = (rarity: string, i: number): CardView => ({
  cardId: `${rarity}-${i}`, anilistId: i, series: "Série", name: `Carte ${i}`, nameNative: null,
  imageUrl: "https://s4.anilist.co/x.png", rank: i, rarity, power: 10, ki: 10,
});
const pool: OpeningTestPool = Object.fromEntries(
  ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"].map((r) => [r, [card(r, 1), card(r, 2)]]),
);
const order = orderedKeys(BASE_DEFINITIONS);

describe("testBoosters", () => {
  it("finit la révélation sur Mythique, AR puis Gold", () => {
    const boosters = testBoosters({ pool, scenario: "all", count: 1, cardsPerBooster: 5, run: 1 });
    const cards = boosters.flatMap((b) => b.cards);
    expect(cards).toHaveLength(5);
    expect(revealOrder(cards, order).slice(-3).map((c) => c.rarity)).toEqual(["MYTHIC", "AR", "GOLD"]);
  });
  it("répartit les grosses cartes sur plusieurs boosters, ids uniques", () => {
    const boosters = testBoosters({ pool, scenario: "all", count: 10, cardsPerBooster: 5, run: 2 });
    const cards = boosters.flatMap((b) => b.cards);
    expect(boosters).toHaveLength(10);
    expect(cards).toHaveLength(50);
    expect(new Set(cards.map((c) => c.userCardId)).size).toBe(50);
    expect(cards.filter((c) => ["MYTHIC", "AR", "GOLD"].includes(c.rarity))).toHaveLength(3);
  });
  it("sans grosse rareté : une Légendaire au plus haut", () => {
    const cards = testBoosters({ pool, scenario: "none", count: 5, cardsPerBooster: 5, run: 3 }).flatMap((b) => b.cards);
    expect(revealOrder(cards, order).at(-1)?.rarity).toBe("LEGENDARY");
  });
});
