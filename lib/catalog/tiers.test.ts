import { describe, expect, it } from "vitest";
import { BASE_DEFINITIONS } from "./definitions";
import { atLeastRarity, fxTier, isBigMoment } from "./tiers";

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
