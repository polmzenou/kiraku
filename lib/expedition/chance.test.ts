import { describe, expect, it } from "vitest";
import { BASE_DEFINITIONS } from "@/lib/catalog/definitions";
import { SETTING_DEFAULTS } from "@/lib/settings/defaults";
import { cardBonusFor, chancesFromRaw, checkTeam, teamChances, toBasisPoints } from "./chance";
import { headroom, tierDelta, tierLevels, tierOf } from "./tiers";

const defs = BASE_DEFINITIONS;
const bonus = SETTING_DEFAULTS["expedition.cardBonus"];
const team = (...rarities: string[]) => rarities.map((rarity, i) => ({ cardId: `c${i}`, rarity }));
const rules = (minRarity: string, base: number, max: number, triumph = 10) => ({ minRarity, baseSuccessPct: base, maxSuccessPct: max, maxTriumphPct: triumph });

describe("paliers de rareté", () => {
  it("regroupe les raretés de même rang", () => {
    expect(tierLevels(defs)).toEqual([0, 100, 200, 300, 400, 500, 600, 700, 750, 800]);
    expect(tierOf("MYTHIC", defs)).toBe(tierOf("BR", defs));
    expect(tierOf("AR", defs)).toBe(tierOf("VR", defs));
    expect(tierOf("GOLD", defs)).toBe(tierOf("MR", defs));
    // L'Esprit est seul à son rang, entre Gold/MR et XR
    expect(tierOf("SR", defs)).toBe(8);
    expect(tierOf("XR", defs)).toBe(9);
    expect(tierOf("INCONNUE", defs)).toBeNull();
  });

  it("mesure l'écart avec la rareté exigée", () => {
    expect(tierDelta("XR", "GOLD", defs)).toBe(2);
    expect(tierDelta("SR", "GOLD", defs)).toBe(1);
    expect(tierDelta("MR", "GOLD", defs)).toBe(0);
    expect(tierDelta("COMMON", "XR", defs)).toBe(-9);
    expect(tierDelta("INCONNUE", "EPIC", defs)).toBe(Number.NEGATIVE_INFINITY);
    expect(headroom("XR", defs)).toBe(0);
    expect(headroom("EPIC", defs)).toBe(6);
  });
});

describe("chances d'une équipe", () => {
  it("donne un bonus selon l'écart de palier", () => {
    expect([-5, -3, -2, -1, 0, 1, 2, 3, 6].map((d) => cardBonusFor(d, bonus))).toEqual([0, 0, 2, 4, 10, 14, 17, 20, 20]);
  });

  it("XR périlleuse : plus il y a de XR, plus les chances montent (exemples du plan)", () => {
    const xr = rules("XR", 20, 80);
    expect(teamChances(team("XR", "COMMON", "COMMON"), xr, bonus, defs).success).toBe(30);
    // Gold et MR sont deux paliers sous XR depuis l'Esprit (2 points chacune), une Esprit un seul (4 points)
    expect(teamChances(team("XR", "GOLD", "MR"), xr, bonus, defs).success).toBe(34);
    expect(teamChances(team("XR", "SR", "MR"), xr, bonus, defs).success).toBe(36);
    expect(teamChances(team("XR", "XR", "GOLD"), xr, bonus, defs).success).toBe(42);
    expect(teamChances(team("XR", "XR", "XR"), xr, bonus, defs).success).toBe(50);
  });

  it("Mythique équilibrée : plafond, puis surplus en triomphe", () => {
    const mythic = rules("MYTHIC", 50, 92, 15);
    expect(teamChances(team("MYTHIC", "COMMON", "RARE"), mythic, bonus, defs)).toMatchObject({ success: 60, triumph: 0, qualifies: true });
    expect(teamChances(team("MYTHIC", "BR", "MYTHIC"), mythic, bonus, defs).success).toBe(80);
    expect(teamChances(team("AR", "VR", "AR"), mythic, bonus, defs)).toMatchObject({ raw: 92, success: 92, triumph: 0 });
    expect(teamChances(team("GOLD", "MR", "GOLD"), mythic, bonus, defs)).toMatchObject({ raw: 101, success: 92, triumph: 9 });
    expect(teamChances(team("XR", "XR", "XR"), mythic, bonus, defs)).toMatchObject({ raw: 110, success: 92, triumph: 15 });
  });

  it("sûre : toujours réussie, les bonnes cartes donnent du triomphe", () => {
    const safe = rules("EPIC", 100, 100, 25);
    expect(teamChances(team("EPIC", "COMMON", "COMMON"), safe, bonus, defs)).toMatchObject({ success: 100, triumph: 10 });
    expect(teamChances(team("XR", "XR", "XR"), safe, bonus, defs)).toMatchObject({ success: 100, triumph: 25 });
  });

  it("exige au moins une carte de la rareté demandée", () => {
    const gold = rules("GOLD", 40, 88);
    const chances = teamChances(team("AR", "AR", "VR"), gold, bonus, defs);
    expect(chances.qualifies).toBe(false);
    expect(chances.breakdown.map((c) => c.bonus)).toEqual([4, 4, 4]);
  });

  it("borne réussite et triomphe", () => {
    expect(chancesFromRaw(-20, { maxSuccessPct: 90, maxTriumphPct: 10 })).toEqual({ success: 0, triumph: 0 });
    expect(chancesFromRaw(500, { maxSuccessPct: 100, maxTriumphPct: 100 })).toEqual({ success: 100, triumph: 100 });
    expect(chancesFromRaw(130, { maxSuccessPct: 95, maxTriumphPct: 0 })).toEqual({ success: 95, triumph: 0 });
    expect(toBasisPoints(37)).toBe(3700);
  });

  it("vérifie la forme de l'équipe", () => {
    expect(checkTeam(["a", "b", "c"])).toBeNull();
    expect(checkTeam(["a", "b"])).toBe("TEAM_SIZE");
    expect(checkTeam(["a", "b", "c", "d"])).toBe("TEAM_SIZE");
    expect(checkTeam(["a", "a", "c"])).toBe("DUPLICATE");
  });
});
