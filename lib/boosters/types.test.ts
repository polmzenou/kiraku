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
  localize,
  localizedSchema,
  priceFor,
  slugSchema,
} from "./types";

const base = { active: true, startsAt: null, endsAt: null, usesFreeStock: true, priceZeni: 200, filter: {} };
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

describe("les 35 boosters de départ", () => {
  it("35 boosters en 8 familles, slugs uniques", () => {
    expect(BOOSTER_SEEDS).toHaveLength(35);
    expect(new Set(BOOSTER_SEEDS.map((s) => s.family))).toEqual(new Set(BOOSTER_FAMILIES));
    expect(new Set(BOOSTER_SEEDS.map((s) => s.slug)).size).toBe(35);
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

  it("rareté : ni pitié, ni doré, ni divin ; formats : pitié seulement", () => {
    const bonuses = (slug: string) => {
      const s = BOOSTER_SEEDS.find((x) => x.slug === slug)!;
      return bonusesFor({ bonusEligible: s.bonusEligible ?? true, countsForPity: s.countsForPity ?? true });
    };
    for (const slug of ["rare", "epique", "legendaire", "mythique"]) {
      expect(bonuses(slug)).toEqual({ golden: false, divine: false, pity: false });
    }
    for (const slug of ["pochibukuro", "jubako"]) {
      expect(bonuses(slug)).toEqual({ golden: false, divine: false, pity: true });
    }
    expect(bonuses("standard")).toEqual({ golden: true, divine: true, pity: true });
  });
});
