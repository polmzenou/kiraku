import { describe, expect, it } from "vitest";
import { RARITIES, type Rarity } from "@/lib/catalog/rarity";
import { BOOSTER_SEEDS } from "@/prisma/seed/booster-types";
import { DEFAULT_RULES } from "./fixtures";
import {
  atLeastOdds,
  boosterChances,
  featuredBoosterChance,
  featuredMeanGap,
  longRunMythicRate,
  mythicsPerDay,
  resolveRarity,
  slotDistribution,
  type PoolCounts,
} from "./odds";
import { effectiveSlotFloors } from "./types";

const rates = DEFAULT_RULES.rates;
const pct = (p: number) => p * 100;

// Tableau « Composition par type » du plan : Épique+, Légendaire+, Mythique par booster (en %).
// Standard Légendaire+ : 2,147 % exactement (le plan affichait 2,2 %, arrondi corrigé).
const PLAN_TABLE: [string, Rarity[], number, number, number][] = [
  ["Standard C · C · U+ · R+", ["COMMON", "COMMON", "UNCOMMON", "RARE"], 18.4, 2.15, 0.31],
  ["Rare R+ ×4", ["RARE", "RARE", "RARE", "RARE"], 40.4, 5.3, 0.77],
  ["Épique R+ · R+ · E+ · E+", ["RARE", "RARE", "EPIC", "EPIC"], 100, 23.1, 3.5],
  ["Légendaire E+ ×3 · L+", ["EPIC", "EPIC", "EPIC", "LEGENDARY"], 100, 100, 18.3],
  ["Mythique E+ ×3 · M", ["EPIC", "EPIC", "EPIC", "MYTHIC"], 100, 100, 100],
];

/** Écart toléré : une demi-unité de la dernière décimale affichée dans le plan. */
const halfUnit = (shown: number) => (Math.abs(shown * 10 - Math.round(shown * 10)) < 1e-9 ? 0.05 : 0.005);

describe("chances par booster (tableau du plan)", () => {
  it.each(PLAN_TABLE)("%s", (_name, floors, epic, legendary, mythic) => {
    const odds = atLeastOdds(rates, floors);
    expect(Math.abs(pct(odds.EPIC) - epic)).toBeLessThan(halfUnit(epic));
    expect(Math.abs(pct(odds.LEGENDARY) - legendary)).toBeLessThan(halfUnit(legendary));
    expect(Math.abs(pct(odds.MYTHIC) - mythic)).toBeLessThan(halfUnit(mythic));
  });

  it("un emplacement sans plancher suit les parts de la section Raretés", () => {
    const slot = slotDistribution(rates, "COMMON");
    expect(pct(slot.MYTHIC)).toBeCloseTo(0.025, 3);
    expect(pct(slot.COMMON)).toBeCloseTo(62.016, 2);
    expect(Object.values(slot).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });
});

describe("taux de Mythique sur le long terme", () => {
  it("sans bonus ni pitié atteignable, égal à la chance d'un booster normal", () => {
    const rules = { ...DEFAULT_RULES, goldenEvery: 0, divineOdds: 0, pityThreshold: 10_000 };
    expect(longRunMythicRate(rules)).toBeCloseTo(atLeastOdds(rates, rules.slotFloors).MYTHIC, 6);
  });

  it("la pitié seule borne l'écart : pitié à 1 = une Mythique à chaque booster", () => {
    expect(longRunMythicRate({ ...DEFAULT_RULES, pityThreshold: 1 })).toBeCloseTo(1, 12);
  });

  it("pitié seule : écart moyen ~175 boosters, une Mythique tous les ~1,2 jour (chiffres du plan)", () => {
    const { meanGap, mythicRate } = boosterChances({ ...DEFAULT_RULES, goldenEvery: 0, divineOdds: 0 });
    expect(meanGap).toBeGreaterThan(170);
    expect(meanGap).toBeLessThan(180);
    expect(1 / mythicsPerDay(mythicRate, 10)).toBeCloseTo(1.2, 1);
  });

  it("le doré et le divin rapprochent encore les Mythiques", () => {
    const withBonus = boosterChances(DEFAULT_RULES).meanGap;
    const pityOnly = boosterChances({ ...DEFAULT_RULES, goldenEvery: 0, divineOdds: 0 }).meanGap;
    expect(withBonus).toBeLessThan(pityOnly);
    expect(withBonus).toBeGreaterThan(130);
  });
});

// Tableau publié de chaque type de départ (en %, arrondi tel qu'affiché) : si un taux, un plancher
// ou un seed dérive, ce test casse. null = seuil non publié.
const SEED_TABLE: Record<string, { epic: number | null; legendary: number | null; mythic: number; rare?: number }> = {
  standard: { epic: 18.4, legendary: 2.15, mythic: 0.31 },
  pochibukuro: { rare: 42.7, epic: 5.7, legendary: 0.64, mythic: 0.09 },
  jubako: { epic: 100, legendary: 19.2, mythic: 2.9 },
  rare: { epic: 40.4, legendary: 5.3, mythic: 0.77 },
  epique: { epic: 100, legendary: 23.1, mythic: 3.5 },
  legendaire: { epic: 100, legendary: 100, mythic: 18.3 },
  mythique: { epic: 100, legendary: 100, mythic: 100 },
};

describe("chances de chaque type de départ (sur le catalogue complet)", () => {
  const floorsOf = (slug: string) =>
    effectiveSlotFloors(BOOSTER_SEEDS.find((s) => s.slug === slug)!.slotFloors ?? [], DEFAULT_RULES.slotFloors);

  it.each(Object.entries(SEED_TABLE))("%s", (slug, expected) => {
    const odds = atLeastOdds(rates, floorsOf(slug));
    if (expected.rare !== undefined) expect(Math.abs(pct(odds.RARE) - expected.rare)).toBeLessThan(halfUnit(expected.rare));
    if (expected.epic !== null) expect(Math.abs(pct(odds.EPIC) - expected.epic)).toBeLessThan(halfUnit(expected.epic));
    if (expected.legendary !== null) {
      expect(Math.abs(pct(odds.LEGENDARY) - expected.legendary)).toBeLessThan(halfUnit(expected.legendary));
    }
    expect(Math.abs(pct(odds.MYTHIC) - expected.mythic)).toBeLessThan(halfUnit(expected.mythic));
  });

  it("Jūbako : 20 cartes, dont une Épique garantie", () => {
    const floors = floorsOf("jubako");
    expect(floors).toHaveLength(20);
    expect(floors.filter((f) => f === "EPIC")).toHaveLength(1);
  });

  it("les boosters filtrés gardent la composition standard", () => {
    for (const s of BOOSTER_SEEDS.filter((x) => x.kind === "FILTERED")) {
      expect(floorsOf(s.slug)).toEqual(DEFAULT_RULES.slotFloors);
    }
  });
});

const counts = (over: Partial<Record<Rarity, number>> = {}): PoolCounts =>
  ({ ...Object.fromEntries(RARITIES.map((r) => [r, 100])), ...over }) as PoolCounts;

describe("pools troués : les chances suivent le repli du tirage", () => {
  it("un palier vide descend au palier inférieur, puis remonte", () => {
    expect(resolveRarity("MYTHIC", counts({ MYTHIC: 0 }))).toBe("LEGENDARY");
    expect(resolveRarity("MYTHIC", counts({ MYTHIC: 0, LEGENDARY: 0 }))).toBe("EPIC");
    expect(resolveRarity("COMMON", counts({ COMMON: 0 }))).toBe("UNCOMMON");
  });

  it("sans Mythique dans le pool (Josei), la part Mythique passe en Légendaire", () => {
    const full = slotDistribution(rates, "COMMON");
    const holed = slotDistribution(rates, "COMMON", counts({ MYTHIC: 0 }));
    expect(holed.MYTHIC).toBe(0);
    expect(holed.LEGENDARY).toBeCloseTo(full.LEGENDARY + full.MYTHIC, 12);
    expect(Object.values(holed).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(atLeastOdds(rates, DEFAULT_RULES.slotFloors, counts({ MYTHIC: 0 })).MYTHIC).toBe(0);
  });

  it("un pool complet donne les mêmes chances que sans pool", () => {
    expect(atLeastOdds(rates, DEFAULT_RULES.slotFloors, counts())).toEqual(atLeastOdds(rates, DEFAULT_RULES.slotFloors));
  });
});

describe("chances vedette (bannière)", () => {
  const featured = counts({ COMMON: 0, UNCOMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0, MYTHIC: 1 });

  it("une Mythique vedette à 50 % : la moitié des Mythiques, plus sa part du pool", () => {
    const pool = counts({ MYTHIC: 200 });
    const p = featuredBoosterChance(rates, DEFAULT_RULES.slotFloors, { rate: 5000, featured, counts: pool });
    const mythic = atLeastOdds(rates, DEFAULT_RULES.slotFloors).MYTHIC;
    // ≈ P(Mythique) × (50 % + 50 % × 1/200)
    expect(p).toBeCloseTo(mythic * (0.5 + 0.5 / 200), 5);
  });

  it("taux vedette nul : seulement la part de la vedette dans le pool", () => {
    const pool = counts({ MYTHIC: 200 });
    const p = featuredBoosterChance(rates, DEFAULT_RULES.slotFloors, { rate: 0, featured, counts: pool });
    expect(p).toBeCloseTo(atLeastOdds(rates, DEFAULT_RULES.slotFloors).MYTHIC / 200, 6);
  });

  it("la pitié vedette borne l'écart moyen", () => {
    expect(featuredMeanGap(0, 100)).toBe(100);
    expect(featuredMeanGap(1, 100)).toBe(1);
    expect(featuredMeanGap(0.01, 100)).toBeCloseTo((1 - 0.99 ** 100) / 0.01, 9);
    expect(featuredMeanGap(0.01, 0)).toBeCloseTo(100, 9);
  });
});
