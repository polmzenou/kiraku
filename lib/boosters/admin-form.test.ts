import { describe, expect, it } from "vitest";
import { boosterTypeFormSchema, cleanFilter, newBannerForm, newFocusForm } from "./admin-form";

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

describe("formulaire d'un Focus série", () => {
  const focus = { ...newFocusForm(new Date("2026-10-27T10:00:00Z")), slug: "focus-jjk", name: { fr: "Focus JJK", en: "JJK focus" }, focusSeriesIds: [113415] };

  it("préréglage : Spéciaux, tout le catalogue, 40 %, fin dans 7 jours, inactif", () => {
    const base = newFocusForm(new Date("2026-10-27T10:00:00Z"));
    expect(base).toMatchObject({ kind: "FOCUS", family: "special", filter: {}, featuredRate: 4000, active: false });
    expect(base.endsAt).toBe("2026-11-03T10:00:00.000Z");
    expect(boosterTypeFormSchema.safeParse(focus).success).toBe(true);
  });

  it("refuse un Focus sans série, sans date de fin ou avec trop de séries", () => {
    expect(boosterTypeFormSchema.safeParse({ ...focus, focusSeriesIds: [] }).success).toBe(false);
    expect(boosterTypeFormSchema.safeParse({ ...focus, endsAt: null }).success).toBe(false);
    expect(boosterTypeFormSchema.safeParse({ ...focus, focusSeriesIds: Array.from({ length: 11 }, (_, i) => i + 1) }).success).toBe(false);
  });

  it("une bannière n'a besoin ni de série ni de date de fin", () => {
    expect(boosterTypeFormSchema.safeParse({ ...valid, focusSeriesIds: [], endsAt: null }).success).toBe(true);
  });
});
