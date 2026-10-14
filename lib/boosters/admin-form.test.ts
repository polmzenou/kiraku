import { describe, expect, it } from "vitest";
import { boosterTypeFormSchema, cleanFilter, newBannerForm } from "./admin-form";

const valid = { ...newBannerForm(), slug: "banniere-jjk", name: { fr: "Jujutsu", en: "Jujutsu" } };

describe("formulaire d'un type de booster", () => {
  it("accepte une nouvelle bannière complète", () => {
    expect(boosterTypeFormSchema.safeParse(valid).success).toBe(true);
  });

  it("retire les champs vides du filtre avant de le valider", () => {
    const parsed = boosterTypeFormSchema.parse({ ...valid, filter: { tags: [], genres: ["Sports"], studio: "", currentSeason: false } });
    expect(parsed.filter).toEqual({ genres: ["Sports"] });
    expect(cleanFilter({ yearMin: undefined, role: "MAIN" })).toEqual({ role: "MAIN" });
  });

  it("refuse un champ inconnu, un kanji absent ou des dates inversées", () => {
    expect(boosterTypeFormSchema.safeParse({ ...valid, role: "ADMIN" }).success).toBe(false);
    expect(boosterTypeFormSchema.safeParse({ ...valid, emblem: "A" }).success).toBe(false);
    expect(boosterTypeFormSchema.safeParse({ ...valid, emblem: "金星月" }).success).toBe(false);
    expect(
      boosterTypeFormSchema.safeParse({ ...valid, startsAt: "2026-11-02T00:00:00Z", endsAt: "2026-11-01T00:00:00Z" }).success,
    ).toBe(false);
  });

  it("borne les prix, taux vedette et identifiants", () => {
    expect(boosterTypeFormSchema.safeParse({ ...valid, priceZeni: -1 }).success).toBe(false);
    expect(boosterTypeFormSchema.safeParse({ ...valid, featuredRate: 10_001 }).success).toBe(false);
    expect(boosterTypeFormSchema.safeParse({ ...valid, slug: "Bannière JJK" }).success).toBe(false);
    expect(boosterTypeFormSchema.safeParse({ ...valid, theme: { ...valid.theme, base: "url(x)" } }).success).toBe(false);
  });
});
