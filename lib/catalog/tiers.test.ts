import { describe, expect, it } from "vitest";
import { ratesFrom } from "@/lib/boosters/draw";
import { BASE_DEFINITIONS, orderedKeys } from "./definitions";
import { atLeastRarity, fxTier, isBigMoment, isTopTier, suggestedStats } from "./tiers";

describe("fxTier", () => {
  it("garde les raretés de base", () => {
    expect(fxTier("EPIC", BASE_DEFINITIONS)).toBe("EPIC");
  });
  it("place AR et Gold sur la cérémonie Mythique", () => {
    expect(fxTier("AR", BASE_DEFINITIONS)).toBe("MYTHIC");
    expect(fxTier("GOLD", BASE_DEFINITIONS)).toBe("MYTHIC");
  });
  it("prend la base juste en dessous d'une rareté intermédiaire", () => {
    expect(fxTier("JADE", [...BASE_DEFINITIONS, { key: "JADE", sortOrder: 350 }])).toBe("EPIC");
    expect(fxTier("UNKNOWN", BASE_DEFINITIONS)).toBe("COMMON");
  });
  it("compare selon l'ordre du registre", () => {
    expect(atLeastRarity("GOLD", "MYTHIC", BASE_DEFINITIONS)).toBe(true);
    expect(atLeastRarity("LEGENDARY", "AR", BASE_DEFINITIONS)).toBe(false);
  });
});

describe("isBigMoment", () => {
  it("met en scène les Légendaires et au-delà", () => {
    for (const key of ["LEGENDARY", "MYTHIC", "AR", "GOLD"]) expect(isBigMoment(key, BASE_DEFINITIONS)).toBe(true);
  });
  it("laisse les Épiques et en dessous sans grand moment", () => {
    for (const key of ["COMMON", "RARE", "EPIC"]) expect(isBigMoment(key, BASE_DEFINITIONS)).toBe(false);
    expect(isBigMoment("UNKNOWN", BASE_DEFINITIONS)).toBe(false);
  });
  it("suit l'ordre d'une rareté personnalisée", () => {
    expect(isBigMoment("JADE", [...BASE_DEFINITIONS, { key: "JADE", sortOrder: 450 }])).toBe(true);
  });
});

describe("isTopTier", () => {
  it("réunit Mythique, AR et Gold", () => {
    for (const key of ["MYTHIC", "AR", "GOLD"]) expect(isTopTier(key, BASE_DEFINITIONS)).toBe(true);
  });
  it("laisse la Légendaire et en dessous au dos classique", () => {
    for (const key of ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "UNKNOWN"]) expect(isTopTier(key, BASE_DEFINITIONS)).toBe(false);
  });
  it("suit les raretés ajoutées au-dessus de Mythique", () => {
    expect(isTopTier("ONYX", [...BASE_DEFINITIONS, { key: "ONYX", sortOrder: 900 }])).toBe(true);
  });
});

describe("rangs des raretés visuelles", () => {
  it("BR = Mythique < AR = VR < Gold = MR < XR", () => {
    for (const [a, b] of [["BR", "MYTHIC"], ["VR", "AR"], ["MR", "GOLD"]]) {
      expect(atLeastRarity(a, b, BASE_DEFINITIONS)).toBe(true);
      expect(atLeastRarity(b, a, BASE_DEFINITIONS)).toBe(true);
    }
    expect(atLeastRarity("BR", "AR", BASE_DEFINITIONS)).toBe(false);
    expect(atLeastRarity("VR", "GOLD", BASE_DEFINITIONS)).toBe(false);
    expect(atLeastRarity("MR", "XR", BASE_DEFINITIONS)).toBe(false);
    expect(atLeastRarity("XR", "GOLD", BASE_DEFINITIONS)).toBe(true);
    expect(fxTier("BR", BASE_DEFINITIONS)).toBe("MYTHIC");
    expect(isTopTier("XR", BASE_DEFINITIONS)).toBe(true);
  });
  it("à rang égal, la rareté de base d'abord : une BR compte comme « Mythique ou mieux »", () => {
    const order = orderedKeys(BASE_DEFINITIONS);
    expect(order.slice(4)).toEqual(["LEGENDARY", "MYTHIC", "BR", "AR", "VR", "GOLD", "MR", "XR"]);
    expect(order.indexOf("BR")).toBeGreaterThan(order.indexOf("MYTHIC"));
    const rates = Object.fromEntries(order.map((r) => [r, 1]));
    expect(ratesFrom(rates, "MYTHIC").map(([r]) => r)).toContain("BR");
  });
  it("propose les stats de la rareté, sinon de son rang, sinon un palier au-dessus", () => {
    const medians = { MYTHIC: { power: 90, ki: 70 }, AR: { power: 94, ki: 75 }, GOLD: { power: 99, ki: 82 } };
    expect(suggestedStats("GOLD", BASE_DEFINITIONS, medians)).toEqual({ power: 99, ki: 82, from: "GOLD", above: false });
    expect(suggestedStats("BR", BASE_DEFINITIONS, medians)).toEqual({ power: 90, ki: 70, from: "MYTHIC", above: false });
    expect(suggestedStats("VR", BASE_DEFINITIONS, medians)).toEqual({ power: 94, ki: 75, from: "AR", above: false });
    expect(suggestedStats("MR", BASE_DEFINITIONS, medians)).toEqual({ power: 99, ki: 82, from: "GOLD", above: false });
    expect(suggestedStats("XR", BASE_DEFINITIONS, medians)).toEqual({ power: 104, ki: 89, from: "GOLD", above: true });
    // Toujours strictement au-dessus, même si deux rangs ont la même médiane ; jamais au-delà du maximum
    expect(suggestedStats("XR", BASE_DEFINITIONS, { AR: { power: 99, ki: 70 }, GOLD: { power: 99, ki: 998 } })).toEqual({ power: 100, ki: 999, from: "GOLD", above: true });
    expect(suggestedStats("XR", BASE_DEFINITIONS, {})).toBeNull();
    expect(suggestedStats("INCONNUE", BASE_DEFINITIONS, medians)).toBeNull();
  });
});
