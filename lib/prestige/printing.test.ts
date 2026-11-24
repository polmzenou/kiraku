import { describe, expect, it } from "vitest";
import { seededRng, type Rng } from "@/lib/rng";
import { engravable, fudaCopyOf, ONE_OF_ONE_PRINTING, pickFreeSerial, printingSize, readEditions, rollEngravings, sealOf, type PrintingRules } from "./printing";

const ORDER = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC", "BR", "AR", "VR", "GOLD", "MR", "XR"];
const RULES: PrintingRules = { minPrestige: 1, chanceBp: { MYTHIC: 200, XR: 10_000, LEGENDARY: 10_000 }, sizes: { MYTHIC: 25 }, current: 1 };

/** Générateur qui compte ses tirages et rend toujours la même valeur. */
function counting(value: (max: number) => number) {
  const calls: number[] = [];
  const rng: Rng = (max) => {
    calls.push(max);
    return value(max);
  };
  return { rng, calls };
}

describe("engravable", () => {
  it("seules les Mythiques et au-dessus, avec une chance réglée", () => {
    expect(engravable("MYTHIC", ORDER, RULES)).toBe(true);
    expect(engravable("XR", ORDER, RULES)).toBe(true);
    // Réglée par erreur sous le plancher : jamais gravée
    expect(engravable("LEGENDARY", ORDER, RULES)).toBe(false);
    // Au-dessus du plancher mais sans chance réglée
    expect(engravable("BR", ORDER, RULES)).toBe(false);
    expect(engravable("MYTHIC", ORDER, { chanceBp: { MYTHIC: 0 } })).toBe(false);
    // Rareté inconnue ou ordre sans Mythique
    expect(engravable("TEST", ORDER, { chanceBp: { TEST: 500 } })).toBe(false);
    expect(engravable("XR", ["COMMON", "XR"], RULES)).toBe(false);
  });
});

describe("rollEngravings", () => {
  const cards = [{ rarity: "COMMON" }, { rarity: "MYTHIC" }, { rarity: "XR" }, { rarity: "LEGENDARY" }, { rarity: "MYTHIC" }];

  it("sous le prestige minimal, rien n'est tiré et le générateur n'est pas touché", () => {
    const { rng, calls } = counting(() => 0);
    expect(rollEngravings(rng, cards, { prestige: 0, order: ORDER, rules: RULES })).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("un tirage sur 10 000 par carte gravable, et seulement pour elles", () => {
    const { rng, calls } = counting(() => 199);
    // 199 < 200 : les deux Mythiques passent ; la XR est à 100 %
    expect(rollEngravings(rng, cards, { prestige: 1, order: ORDER, rules: RULES })).toEqual([1, 2, 4]);
    expect(calls).toEqual([10_000, 10_000, 10_000]);
    const miss = counting(() => 200);
    expect(rollEngravings(miss.rng, cards, { prestige: 3, order: ORDER, rules: RULES })).toEqual([2]);
  });

  it("à 2 %, environ 2 Mythiques sur 100 sortent gravées", () => {
    const rng = seededRng(42);
    const mythics = Array.from({ length: 20_000 }, () => ({ rarity: "MYTHIC" }));
    const rate = rollEngravings(rng, mythics, { prestige: 1, order: ORDER, rules: RULES }).length / mythics.length;
    expect(rate).toBeGreaterThan(0.015);
    expect(rate).toBeLessThan(0.025);
  });
});

describe("pickFreeSerial", () => {
  it("épuise un tirage en rendant chaque numéro une fois, dans le désordre", () => {
    const rng = seededRng(7);
    const taken: number[] = [];
    for (let i = 0; i < 25; i++) taken.push(pickFreeSerial(rng, 25, taken)!);
    expect([...taken].sort((a, b) => a - b)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    expect(taken).not.toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    expect(pickFreeSerial(rng, 25, taken)).toBeNull();
  });

  it("tire uniformément parmi les numéros libres", () => {
    expect(pickFreeSerial(() => 0, 5, [1, 2])).toBe(3);
    expect(pickFreeSerial((max) => max - 1, 5, [5])).toBe(4);
    const { rng, calls } = counting(() => 1);
    expect(pickFreeSerial(rng, 5, [2, 4])).toBe(3);
    expect(calls).toEqual([3]);
  });
});

describe("affichage d'une édition", () => {
  it("taille par rareté, 25 par défaut ; sceau du tirage", () => {
    expect(printingSize("MYTHIC", { sizes: { MYTHIC: 10 } })).toBe(10);
    expect(printingSize("XR", { sizes: {} })).toBe(25);
    expect(sealOf(1, { "1": "初摺" })).toBe("初摺");
    expect(sealOf(2, { "1": "初摺" })).toBeNull();
    // Tirage réservé des cartes 1/1 : son sceau par défaut, jamais pris par le réglage du prestige
    expect(sealOf(ONE_OF_ONE_PRINTING, {})).toBe("唯");
    expect(fudaCopyOf({ heritage: 0, printing: ONE_OF_ONE_PRINTING, serial: 1, size: 1 }, { "1": "初摺" })).toEqual({ heritage: 0, printing: 1000, serial: 1, size: 1, seal: "唯" });
  });

  it("une fuda ordinaire reste inchangée ; une héritière ou une gravée porte ses marques", () => {
    const seals = { "1": "初摺" };
    expect(fudaCopyOf({ heritage: 0, printing: null, serial: null }, seals)).toBeNull();
    expect(fudaCopyOf({ heritage: 2, printing: null, serial: null }, seals)).toEqual({ heritage: 2, printing: null, serial: null, size: null, seal: null });
    expect(fudaCopyOf({ heritage: 0, printing: 1, serial: 17, size: 25 }, seals)).toEqual({ heritage: 0, printing: 1, serial: 17, size: 25, seal: "初摺" });
  });

  it("les éditions d'une ouverture se relisent sans faire confiance au JSON", () => {
    const editions = readEditions([
      { position: 2, printing: 1, serial: 17, size: 25 },
      { position: 3, printing: 1, serial: 30, size: 25 },
      { position: "4", printing: 1, serial: 1, size: 25 },
      null,
      { position: 0, printing: 0, serial: 1, size: 25 },
    ]);
    expect([...editions]).toEqual([[2, { printing: 1, serial: 17, size: 25 }]]);
    expect(readEditions(null).size).toBe(0);
    expect(readEditions({ position: 1 }).size).toBe(0);
  });
});
