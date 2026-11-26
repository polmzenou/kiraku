import { describe, expect, it } from "vitest";
import { BASE_DEFINITIONS } from "@/lib/catalog/definitions";
import { casinoTiers, flipStaging, isBigFlip, raritiesForTier, tierOf } from "./tiers";

const DEFS = BASE_DEFINITIONS;
const ALL = DEFS.map((d) => d.key);

describe("paliers", () => {
  it("le palier est le rang du registre", () => {
    expect(tierOf("COMMON", DEFS)).toBe(0);
    expect(tierOf("MYTHIC", DEFS)).toBe(500);
    expect(tierOf("INCONNUE", DEFS)).toBeNull();
  });

  it("Mythique = BR, AR = VR, Gold = MR ; XR seule au sommet", () => {
    expect(tierOf("MYTHIC", DEFS)).toBe(tierOf("BR", DEFS));
    expect(tierOf("AR", DEFS)).toBe(tierOf("VR", DEFS));
    expect(tierOf("GOLD", DEFS)).toBe(tierOf("MR", DEFS));
    expect(tierOf("BR", DEFS)).not.toBe(tierOf("AR", DEFS));
    expect(tierOf("XR", DEFS)).not.toBe(tierOf("GOLD", DEFS));
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

  it("palier de mise en scène : 0 pour une Commune, 6 au-dessus de Mythique", () => {
    expect(flipStaging("COMMON", DEFS)).toMatchObject({ fx: "COMMON", level: 0 });
    expect(flipStaging("MYTHIC", DEFS)).toMatchObject({ fx: "MYTHIC", level: 5 });
    expect(flipStaging("BR", DEFS).level).toBe(5);
    expect(flipStaging("XR", DEFS)).toMatchObject({ fx: "MYTHIC", level: 6 });
  });

  it("le palier croît avec la rareté (la durée du lancer suit, lib/casino/choreography.ts)", () => {
    const levels = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC", "GOLD"].map((r) => flipStaging(r, DEFS).level);
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
  });
});
