import { describe, expect, it } from "vitest";
import {
  CONSENT_MAX_AGE_DAYS,
  CONSENT_VERSION,
  hasConsent,
  makeConsent,
  needsPrompt,
  parseConsent,
  serializeConsent,
} from "./consent";
import { optionalCategories, STORAGE_REGISTRY, type StorageEntry } from "./registry";

const now = Date.UTC(2026, 9, 16);
const DAY = 86_400_000;

describe("registre des traceurs", () => {
  it("aujourd'hui, tout est exempté : aucun bandeau", () => {
    expect(optionalCategories()).toEqual([]);
    expect(needsPrompt(null, optionalCategories(), now)).toBe(false);
  });

  it("un traceur non exempté fait apparaître sa catégorie", () => {
    const extra: StorageEntry = {
      name: "_mesure",
      kind: "cookie",
      category: "measure",
      purpose: "sound",
      duration: { unit: "days", value: 395 },
      provider: "kiraku",
      exempt: false,
    };
    expect(optionalCategories([...STORAGE_REGISTRY, extra])).toEqual(["measure"]);
  });

  it("chaque entrée a un nom et un rôle", () => {
    for (const e of STORAGE_REGISTRY) {
      expect(e.name.length).toBeGreaterThan(0);
      expect(e.purpose).toMatch(/^[a-zA-Z]+$/);
    }
  });
});

describe("choix de consentement", () => {
  it.each([
    null, [], { v: 1, at: 0, choices: [] }, { v: 1, at: 0, choices: { measure: "true" } },
    { v: 1, at: 0, choices: { advertising: true } }, { v: 1, at: -1, choices: {} },
    { v: 1.5, at: 0, choices: {} }, { v: 1, at: Number.MAX_VALUE, choices: {} },
  ])("refuse un choix mal formé (%j)", (value) => {
    expect(parseConsent(encodeURIComponent(JSON.stringify(value)))).toBeNull();
  });
  it("relit ce qu'il écrit et ignore un cookie abîmé", () => {
    const state = makeConsent(["measure"], false, now);
    expect(parseConsent(serializeConsent(state))).toEqual(state);
    expect(parseConsent("%7Bpas-du-json")).toBeNull();
    expect(parseConsent(encodeURIComponent(JSON.stringify({ v: 1, at: -1, choices: {} })))).toBeNull();
    expect(parseConsent(undefined)).toBeNull();
  });

  it("redemande sans choix, après 6 mois, ou pour une nouvelle catégorie", () => {
    const state = makeConsent(["measure"], true, now);
    expect(needsPrompt(null, ["measure"], now)).toBe(true);
    expect(needsPrompt(state, ["measure"], now + 30 * DAY)).toBe(false);
    expect(needsPrompt(state, ["measure"], now + (CONSENT_MAX_AGE_DAYS + 1) * DAY)).toBe(true);
    expect(needsPrompt(state, ["measure", "preferences"], now)).toBe(true);
    expect(needsPrompt({ ...state, v: CONSENT_VERSION + 1 }, ["measure"], now)).toBe(true);
  });

  it("rien de non nécessaire sans accord explicite", () => {
    const refused = makeConsent(["measure"], false, now);
    const accepted = makeConsent(["measure"], true, now);
    const custom = makeConsent(["measure", "preferences"], { preferences: true }, now);
    expect(hasConsent(null, "necessary", now)).toBe(true);
    expect(hasConsent(null, "measure", now)).toBe(false);
    expect(hasConsent(refused, "measure", now)).toBe(false);
    expect(hasConsent(accepted, "measure", now)).toBe(true);
    expect(hasConsent(accepted, "measure", now + (CONSENT_MAX_AGE_DAYS + 1) * DAY)).toBe(false);
    expect(custom.choices).toEqual({ measure: false, preferences: true });
  });
});
