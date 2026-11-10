import { describe, expect, it } from "vitest";
import { revealOrder } from "@/components/opening/CardDeck";
import { LEAK_COLOR, leakFor } from "@/components/opening/RarityFx";
import type { CardView } from "@/lib/boosters/view";
import { BASE_DEFINITIONS, orderedKeys } from "@/lib/catalog/definitions";
import fr from "@/messages/fr.json";
import en from "@/messages/en.json";
import { OPENING_TEST_SCENARIOS, testBoosters, type OpeningTestPool } from "./opening-test";

const card = (rarity: string, i: number): CardView => ({
  cardId: `${rarity}-${i}`, anilistId: i, series: "Série", name: `Carte ${i}`, nameNative: null,
  imageUrl: "https://s4.anilist.co/x.png", rank: i, rarity, power: 10, ki: 10, spoiler: false,
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
  it("teste chaque rareté visuelle, même sans carte publiée (une autre carte réétiquetée)", () => {
    for (const [scenario, rarity] of [["br", "BR"], ["vr", "VR"], ["mr", "MR"], ["xr", "XR"]] as const) {
      const cards = testBoosters({ pool, scenario, count: 1, cardsPerBooster: 5, run: 4 }).flatMap((b) => b.cards);
      expect(cards).toHaveLength(5);
      expect(revealOrder(cards, order).at(-1)?.rarity).toBe(rarity);
    }
  });
  it("réunit les quatre dans un seul booster, XR en dernier", () => {
    const cards = testBoosters({ pool, scenario: "visual", count: 1, cardsPerBooster: 5, run: 5 }).flatMap((b) => b.cards);
    expect(revealOrder(cards, order).slice(-4).map((c) => c.rarity)).toEqual(["BR", "VR", "MR", "XR"]);
  });
  it("propose chaque scénario dans les deux langues", () => {
    for (const scenario of OPENING_TEST_SCENARIOS) {
      expect(fr.admin.openingTest.scenarios[scenario]).toBeTruthy();
      expect(en.admin.openingTest.scenarios[scenario]).toBeTruthy();
    }
  });
  it("sans grosse rareté : une Légendaire au plus haut", () => {
    const cards = testBoosters({ pool, scenario: "none", count: 5, cardsPerBooster: 5, run: 3 }).flatMap((b) => b.cards);
    expect(revealOrder(cards, order).at(-1)?.rarity).toBe("LEGENDARY");
  });
});

describe("rayon qui sort du booster", () => {
  it("BR, VR, MR et XR : le même blanc que les Mythiques, même absentes du registre", () => {
    for (const rarity of ["BR", "VR", "MR", "XR"]) {
      expect(leakFor(rarity, BASE_DEFINITIONS)).toBe(LEAK_COLOR.MYTHIC);
      expect(leakFor(rarity, [])).toBe(LEAK_COLOR.MYTHIC);
    }
  });
  it("AR et Gold gardent leur couleur", () => {
    expect(leakFor("AR", BASE_DEFINITIONS)).not.toBe(LEAK_COLOR.MYTHIC);
    expect(leakFor("GOLD", BASE_DEFINITIONS)).not.toBe(LEAK_COLOR.MYTHIC);
  });
});
