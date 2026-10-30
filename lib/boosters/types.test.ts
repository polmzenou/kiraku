import { describe, expect, it } from "vitest";
import { SEAL_GLYPHS } from "@/lib/seal-glyphs";
import { BOOSTER_SEEDS } from "@/prisma/seed/booster-types";
import { poolFilterSchema } from "./pool-filter";
import {
  availability,
  BOOSTER_FAMILIES,
  FAMILY_KANJI,
  boosterThemeSchema,
  bonusesFor,
  creditBonuses,
  localize,
  localizedSchema,
  priceFor,
  slugSchema,
  typeDrawRules,
} from "./types";
import { DEFAULT_RULES } from "./fixtures";

const base = { kind: "FILTERED" as const, active: true, startsAt: null, endsAt: null, usesFreeStock: true, priceZeni: 200, filter: {} };
const now = new Date("2026-10-14T12:00:00Z");

describe("priceFor", () => {
  it("gratuit tant que le stock couvre toute l'ouverture", () => {
    expect(priceFor(base, 5, 5)).toEqual({ kind: "free" });
    expect(priceFor(base, 4, 5)).toEqual({ kind: "zeni", amount: 1000 });
    expect(priceFor(base, 0, 1)).toEqual({ kind: "zeni", amount: 200 });
  });

  it("un booster payant se paie toujours, même avec du stock", () => {
    expect(priceFor({ usesFreeStock: false, priceZeni: 300 }, 10, 1)).toEqual({ kind: "zeni", amount: 300 });
  });

  it("sans prix : gratuit avec du stock, sinon indisponible", () => {
    expect(priceFor({ usesFreeStock: true, priceZeni: null }, 0, 1)).toEqual({ kind: "unavailable" });
    expect(priceFor({ usesFreeStock: false, priceZeni: null }, 10, 1)).toEqual({ kind: "unavailable" });
  });
});

describe("availability", () => {
  it("ouvert, réservé aux événements ou caché", () => {
    expect(availability(base, now, 500, 100)).toBe("open");
    expect(availability({ ...base, usesFreeStock: false, priceZeni: null }, now, 500, 100)).toBe("locked");
    expect(availability({ ...base, active: false }, now, 500, 100)).toBe("hidden");
    expect(availability({ ...base, filter: null }, now, 500, 100)).toBe("hidden");
  });

  it("pool trop petit ou hors de ses dates : caché", () => {
    expect(availability(base, now, 99, 100)).toBe("hidden");
    expect(availability(base, now, 20, 20)).toBe("open");
    expect(availability({ ...base, startsAt: new Date("2026-10-15") }, now, 500, 100)).toBe("hidden");
    expect(availability({ ...base, endsAt: now }, now, 500, 100)).toBe("hidden");
    // Sachet scellé : jamais proposé, il s'ouvre depuis l'inventaire
    expect(availability({ ...base, kind: "DROP", usesFreeStock: false, priceZeni: null }, now, 500, 100)).toBe("hidden");
  });
});

describe("contenu admin", () => {
  it("repli sur le français si l'anglais est vide", () => {
    expect(localize({ fr: "Comédie", en: "" }, "en")).toBe("Comédie");
    expect(localize({ fr: "Comédie", en: "Comedy" }, "en")).toBe("Comedy");
  });

  it("le thème n'accepte que des couleurs hex et des motifs connus", () => {
    const ok = { base: "#C8372D", dark: "#5E1712", pattern: "asanoha", ink: "light" };
    expect(boosterThemeSchema.safeParse(ok).success).toBe(true);
    expect(boosterThemeSchema.safeParse({ ...ok, base: "red;background:url(x)" }).success).toBe(false);
    expect(boosterThemeSchema.safeParse({ ...ok, pattern: "inconnu" }).success).toBe(false);
  });
});

describe("les 38 boosters de départ", () => {
  it("35 boosters proposés, l'Impérial exclusif boutique et 2 sachets scellés, en 8 familles, slugs uniques", () => {
    expect(BOOSTER_SEEDS).toHaveLength(38);
    expect(BOOSTER_SEEDS.filter((s) => s.kind === "PRESTIGE").map((s) => s.slug)).toEqual(["imperial"]);
    expect(BOOSTER_SEEDS.filter((s) => s.kind === "DROP").map((s) => s.slug)).toEqual(["divin", "apocalypse"]);
    expect(new Set(BOOSTER_SEEDS.map((s) => s.family))).toEqual(new Set(BOOSTER_FAMILIES));
    expect(new Set(BOOSTER_SEEDS.map((s) => s.slug)).size).toBe(38);
  });

  it("sachets scellés : jamais en vente, ni stock gratuit, ni pitié, ni bonus", () => {
    for (const s of BOOSTER_SEEDS.filter((x) => x.kind === "DROP")) {
      expect(s).toMatchObject({ usesFreeStock: false, priceZeni: null, countsForPity: false, bonusEligible: false });
    }
  });

  it.each(BOOSTER_SEEDS.map((s) => [s.slug, s] as const))("%s : données valides", (_slug, s) => {
    expect(slugSchema.safeParse(s.slug).success).toBe(true);
    expect(boosterThemeSchema.safeParse(s.theme).success).toBe(true);
    expect(localizedSchema.safeParse(s.name).success).toBe(true);
    expect(poolFilterSchema.safeParse(s.filter ?? {}).success).toBe(true);
  });

  it("chaque kanji d'emblème et de famille est dans la police des sceaux", () => {
    const missing = [...BOOSTER_SEEDS.map((s) => s.emblem).join(""), ...Object.values(FAMILY_KANJI).join("")].filter(
      (k) => !SEAL_GLYPHS.includes(k),
    );
    expect(missing).toEqual([]);
  });

  it("rareté : ni pitié, ni doré, ni sachet scellé ; formats : pitié seulement", () => {
    const bonuses = (slug: string) => {
      const s = BOOSTER_SEEDS.find((x) => x.slug === slug)!;
      return bonusesFor({ bonusEligible: s.bonusEligible ?? true, countsForPity: s.countsForPity ?? true, resetsPity: s.resetsPity ?? true });
    };
    for (const slug of ["rare", "epique", "legendaire", "mythique"]) {
      expect(bonuses(slug)).toEqual({ golden: false, drop: false, pity: false, pityReset: true });
    }
    for (const slug of ["pochibukuro", "jubako"]) {
      expect(bonuses(slug)).toEqual({ golden: false, drop: false, pity: true, pityReset: true });
    }
    expect(bonuses("standard")).toEqual({ golden: true, drop: true, pity: true, pityReset: true });
    // L'Impérial fait avancer la pitié, sans que ses Mythiques la remettent à zéro
    expect(bonuses("imperial")).toEqual({ golden: true, drop: true, pity: true, pityReset: false });
  });
});

describe("Impérial (Prestige)", () => {
  const prestige = { ...base, kind: "PRESTIGE" as const, usesFreeStock: false, priceZeni: null };

  it("caché des pages de boosters, en vente en boutique seulement, après les contrôles habituels", () => {
    expect(availability(prestige, now, 500, 100)).toBe("hidden");
    expect(availability(prestige, now, 500, 100, "shop")).toBe("open");
    expect(availability({ ...prestige, active: false }, now, 500, 100, "shop")).toBe("hidden");
    expect(availability(prestige, now, 50, 100, "shop")).toBe("hidden");
    // Les autres types ont la même disponibilité sur les deux canaux
    expect(availability(base, now, 500, 100, "shop")).toBe("open");
    expect(availability({ ...base, kind: "DROP" as const }, now, 500, 100, "shop")).toBe("hidden");
  });

  it("depuis un crédit, garde la pitié et le doré, jamais de sachet scellé", () => {
    const flags = { countsForPity: true, resetsPity: false, bonusEligible: true };
    expect(creditBonuses({ ...flags, kind: "PRESTIGE" })).toEqual({ golden: true, drop: false, pity: true, pityReset: false });
    expect(creditBonuses({ ...flags, resetsPity: true, kind: "FILTERED" })).toEqual({ golden: false, drop: false, pity: true, pityReset: true });
    expect(creditBonuses({ countsForPity: true, resetsPity: false, bonusEligible: false, kind: "PRESTIGE" })).toEqual({ golden: false, drop: false, pity: true, pityReset: false });
  });

  it("règles de tirage du type : planchers globaux et taux boostés à partir de Légendaire", () => {
    const rules = typeDrawRules({ slotFloors: [], rateBoost: 27_000, rateBoostFrom: "LEGENDARY" }, DEFAULT_RULES);
    expect(rules.slotFloors).toEqual(DEFAULT_RULES.slotFloors);
    const total = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
    const share = (r: Record<string, number>, k: string) => r[k] / total(r);
    for (const r of ["LEGENDARY", "MYTHIC", "AR", "GOLD"]) {
      expect(share(rules.rates, r) / share(DEFAULT_RULES.rates, r)).toBeCloseTo(2.7, 6);
    }
    expect(share(rules.rates, "COMMON")).toBeLessThan(share(DEFAULT_RULES.rates, "COMMON"));
    // Sans boost : mêmes taux
    expect(typeDrawRules({ slotFloors: [], rateBoost: 10_000, rateBoostFrom: null }, DEFAULT_RULES).rates).toBe(DEFAULT_RULES.rates);
  });

  it("le seed de l'Impérial : exclusif boutique, 5 cartes comme le standard, ×2,7 dès Légendaire", () => {
    const seed = BOOSTER_SEEDS.find((s) => s.slug === "imperial")!;
    expect(seed).toMatchObject({ kind: "PRESTIGE", usesFreeStock: false, priceZeni: null, countsForPity: true, resetsPity: false, bonusEligible: true, rateBoost: 27_000, rateBoostFrom: "LEGENDARY" });
    expect(seed.slotFloors).toBeUndefined();
  });
});
