import { describe, expect, it } from "vitest";
import { BASE_DEFINITIONS } from "@/lib/catalog/definitions";
import { SETTING_DEFAULTS } from "@/lib/settings/defaults";
import { expeditionTypeInputSchema } from "./admin-form";
import { balanceFor } from "./balance";
import { DEFAULT_EXPEDITIONS } from "./catalog";
import { parseSnapshotPayout, readSnapshot, snapshotSchema } from "./snapshot";
import { rewardsByOutcome } from "./rewards";
import { headroom } from "./tiers";

const rules = { triumphRewardPct: SETTING_DEFAULTS["expedition.triumphRewardPct"], failRewardPct: SETTING_DEFAULTS["expedition.failRewardPct"] };
const bonus = SETTING_DEFAULTS["expedition.cardBonus"];

const asInput = (d: (typeof DEFAULT_EXPEDITIONS)[number]) => ({
  slug: d.slug,
  name: d.name,
  lore: d.lore,
  minRarity: d.minRarity,
  risk: d.risk,
  durationMinutes: d.durationMinutes,
  baseSuccessPct: d.baseSuccessPct,
  maxSuccessPct: d.maxSuccessPct,
  maxTriumphPct: d.maxTriumphPct,
  minDiscoveryPct: d.minDiscoveryPct,
  zeni: d.zeni,
  boosterTypeId: "standard-id",
  boosters: d.boosters,
  extraLotId: d.extra ? "lot-id" : null,
  weight: d.weight,
  active: true,
  sortOrder: d.sortOrder,
});

describe("catalogue par défaut", () => {
  it("couvre chaque palier d'Épique à XR avec les trois risques", () => {
    expect(DEFAULT_EXPEDITIONS).toHaveLength(18);
    expect(new Set(DEFAULT_EXPEDITIONS.map((d) => d.slug)).size).toBe(18);
    for (const rarity of ["EPIC", "LEGENDARY", "MYTHIC", "AR", "GOLD", "XR"]) {
      expect(DEFAULT_EXPEDITIONS.filter((d) => d.minRarity === rarity).map((d) => d.risk)).toEqual(["SAFE", "BALANCED", "RISKY"]);
    }
  });

  it("passe la validation de l'admin", () => {
    for (const d of DEFAULT_EXPEDITIONS) expect(expeditionTypeInputSchema.safeParse(asInput(d)).success, d.slug).toBe(true);
  });

  it("plus c'est rare, plus c'est long et rémunérateur ; plus c'est risqué, plus ça paie", () => {
    for (const risk of ["SAFE", "BALANCED", "RISKY"] as const) {
      const rows = DEFAULT_EXPEDITIONS.filter((d) => d.risk === risk);
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i].durationMinutes).toBeGreaterThan(rows[i - 1].durationMinutes);
        expect(rows[i].zeni).toBeGreaterThan(rows[i - 1].zeni);
        expect(rows[i].baseSuccessPct).toBeLessThanOrEqual(rows[i - 1].baseSuccessPct);
      }
    }
    for (const rarity of ["EPIC", "MYTHIC", "XR"]) {
      const [safe, balanced, risky] = DEFAULT_EXPEDITIONS.filter((d) => d.minRarity === rarity).map((d) =>
        balanceFor(asInput(d) as never, rules, bonus, headroom(d.minRarity, BASE_DEFINITIONS)),
      );
      // Gains attendus avec une équipe juste : la prise de risque reste payante
      expect(balanced.minimal.zeni).toBeGreaterThan(safe.minimal.zeni);
      expect(risky.minimal.zeni).toBeGreaterThan(balanced.minimal.zeni);
    }
  });

  it("chances de l'aperçu d'équilibrage", () => {
    const fox = DEFAULT_EXPEDITIONS.find((d) => d.slug === "sanctuaire-des-renards")!;
    const estimate = balanceFor(asInput(fox) as never, rules, bonus, headroom("MYTHIC", BASE_DEFINITIONS));
    expect(estimate.minimal).toMatchObject({ success: 60, triumph: 0 });
    // 3 × 20 au-dessus : 110 → 92 % et 15 % de triomphe (plafond)
    expect(estimate.ideal).toMatchObject({ success: 92, triumph: 15 });
    // 60 % × 1 000 + 40 % × 250
    expect(estimate.minimal.zeni).toBe(700);
  });

  it("les modèles par défaut donnent une photo valide, relue telle quelle", () => {
    const d = DEFAULT_EXPEDITIONS[0];
    const snap = {
      v: 1,
      slug: d.slug,
      name: d.name,
      lore: d.lore,
      minRarity: d.minRarity,
      risk: d.risk,
      durationMinutes: d.durationMinutes,
      boosterTypeId: "b",
      extraLotId: null,
      rewards: rewardsByOutcome({ zeni: d.zeni, boosters: d.boosters, extraLotId: null }, rules),
      bonuses: [10, 0, 0],
    };
    expect(snapshotSchema.safeParse(snap).success).toBe(true);
    expect(readSnapshot(snap)).toEqual(snap);
    expect(parseSnapshotPayout(snap)?.rewards).toEqual(snap.rewards);
  });
});

describe("formulaire d'un modèle", () => {
  const base = asInput(DEFAULT_EXPEDITIONS[1]);

  it("refuse une expédition sûre qui pourrait rater", () => {
    expect(expeditionTypeInputSchema.safeParse({ ...base, risk: "SAFE" }).success).toBe(false);
    expect(expeditionTypeInputSchema.safeParse({ ...base, risk: "SAFE", baseSuccessPct: 100, maxSuccessPct: 100 }).success).toBe(true);
  });

  it("refuse une base au-dessus du plafond, une durée hors bornes ou une expédition sans gain", () => {
    expect(expeditionTypeInputSchema.safeParse({ ...base, baseSuccessPct: 96 }).success).toBe(false);
    expect(expeditionTypeInputSchema.safeParse({ ...base, durationMinutes: 0 }).success).toBe(false);
    expect(expeditionTypeInputSchema.safeParse({ ...base, durationMinutes: 72 * 60 + 1 }).success).toBe(false);
    expect(expeditionTypeInputSchema.safeParse({ ...base, zeni: 0, boosters: 0, extraLotId: null }).success).toBe(false);
    expect(expeditionTypeInputSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
});
