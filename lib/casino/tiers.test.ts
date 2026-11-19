import { describe, expect, it } from "vitest";
import { BASE_DEFINITIONS } from "@/lib/catalog/definitions";
import { casinoTiers, flipStaging, isBigFlip, raritiesForTier, sameTier, tierOf } from "./tiers";

const DEFS = BASE_DEFINITIONS;
const ALL = DEFS.map((d) => d.key);

describe("paliers", () => {
  it("le palier est le rang du registre", () => {
    expect(tierOf("COMMON", DEFS)).toBe(0);
    expect(tierOf("MYTHIC", DEFS)).toBe(500);
    expect(tierOf("INCONNUE", DEFS)).toBeNull();
  });

  it("Mythique = BR, AR = VR, Gold = MR ; XR seule au sommet", () => {
    expect(sameTier("MYTHIC", "BR", DEFS)).toBe(true);
    expect(sameTier("AR", "VR", DEFS)).toBe(true);
    expect(sameTier("GOLD", "MR", DEFS)).toBe(true);
    expect(sameTier("BR", "AR", DEFS)).toBe(false);
    expect(sameTier("XR", "GOLD", DEFS)).toBe(false);
  });

  it("deux raretés inconnues ne font pas un palier", () => {
    expect(sameTier("X", "Y", DEFS)).toBe(false);
  });

  it("regroupe les raretés autorisées par palier, la rareté de base d'abord", () => {
    expect(casinoTiers(DEFS, ALL)).toEqual([
      { order: 0, rarities: ["COMMON"] },
      { order: 100, rarities: ["UNCOMMON"] },
      { order: 200, rarities: ["RARE"] },
      { order: 300, rarities: ["EPIC"] },
      { order: 400, rarities: ["LEGENDARY"] },
      { order: 500, rarities: ["MYTHIC", "BR"] },
      { order: 600, rarities: ["AR", "VR"] },
      { order: 700, rarities: ["GOLD", "MR"] },
      { order: 750, rarities: ["SR"] },
      { order: 800, rarities: ["XR"] },
    ]);
  });

  it("une rareté retirée par l'admin quitte son palier ; un palier vide disparaît", () => {
    const tiers = casinoTiers(DEFS, ALL.filter((k) => k !== "BR" && k !== "XR"));
    expect(tiers.find((t) => t.order === 500)?.rarities).toEqual(["MYTHIC"]);
    expect(tiers.some((t) => t.order === 800)).toBe(false);
  });

  it("raretés misables pour relever une table", () => {
    expect(raritiesForTier(500, DEFS, ALL)).toEqual(["MYTHIC", "BR"]);
    expect(raritiesForTier(500, DEFS, ["MYTHIC"])).toEqual(["MYTHIC"]);
    expect(raritiesForTier(999, DEFS, ALL)).toEqual([]);
  });
});

describe("gros lancers", () => {
  it("à partir du seuil, dans l'ordre du registre", () => {
    expect(isBigFlip("LEGENDARY", "LEGENDARY", DEFS)).toBe(true);
    expect(isBigFlip("BR", "LEGENDARY", DEFS)).toBe(true);
    expect(isBigFlip("EPIC", "LEGENDARY", DEFS)).toBe(false);
  });
});

describe("mise en scène du lancer", () => {
  it("Lancer jusqu'à Épique, Toupie dès Légendaire", () => {
    expect(flipStaging("EPIC", DEFS).choreography).toBe("toss");
    expect(flipStaging("LEGENDARY", DEFS).choreography).toBe("spin");
    expect(flipStaging("AR", DEFS).choreography).toBe("spin");
  });

  it("environ 3 s pour une Commune, 5 s au-dessus de Mythique", () => {
    expect(flipStaging("COMMON", DEFS)).toMatchObject({ fx: "COMMON", level: 0, durationMs: 3_000 });
    expect(flipStaging("MYTHIC", DEFS)).toMatchObject({ fx: "MYTHIC", level: 5 });
    expect(flipStaging("BR", DEFS).level).toBe(5);
    expect(flipStaging("XR", DEFS)).toMatchObject({ fx: "MYTHIC", level: 6, durationMs: 5_000 });
  });

  it("la durée croît avec le palier", () => {
    const durations = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC", "GOLD"].map((r) => flipStaging(r, DEFS).durationMs);
    expect([...durations].sort((a, b) => a - b)).toEqual(durations);
  });
});
