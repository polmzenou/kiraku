import { describe, expect, it } from "vitest";
import {
  commitSettingsEdits,
  editSettingsDraft,
  mergeSettingsSubmission,
  refreshedSettingsEdits,
  sameSettingValue,
  settingsDraftState,
  settingsSchemaFor,
  settingsSubmissionSchema,
  type SettingsOf,
} from "./form";

// Enregistrement des formulaires de réglages : seules les clés modifiées à l'écran s'écrivent, et une clé modifiée
// qui a changé en base depuis l'ouverture de la page fait refuser l'enregistrement.

const KEYS = ["booster.maxStock", "booster.intervalMinutes", "booster.rates"] as const;
type Values = SettingsOf<(typeof KEYS)[number]>;
const values = (over: Partial<Values> = {}): Values => ({
  "booster.maxStock": 10,
  "booster.intervalMinutes": 60,
  "booster.rates": { COMMON: 90, RARE: 10 },
  ...over,
});

describe("enregistrement d'un formulaire de réglages", () => {
  it("écrit la clé modifiée à l'écran, appliquée sur les valeurs en base", () => {
    const res = mergeSettingsSubmission(KEYS, { base: values(), draft: values({ "booster.maxStock": 12 }) }, values());
    expect(res).toEqual({ ok: true, edited: ["booster.maxStock"], merged: values({ "booster.maxStock": 12 }) });
  });

  it("n'écrit jamais une clé non modifiée, même si la base a changé depuis l'ouverture de la page", () => {
    // Un autre membre de l'équipe a passé le délai à 30 min ; la page ouverte avant affichait encore 60
    const stored = values({ "booster.intervalMinutes": 30, "booster.rates": { COMMON: 80, RARE: 20 } });
    const res = mergeSettingsSubmission(KEYS, { base: values(), draft: values({ "booster.maxStock": 12 }) }, stored);
    expect(res).toEqual({ ok: true, edited: ["booster.maxStock"], merged: { ...stored, "booster.maxStock": 12 } });
  });

  it("refuse une clé modifiée qui a changé en base entre-temps", () => {
    const stored = values({ "booster.maxStock": 11 });
    const res = mergeSettingsSubmission(KEYS, { base: values(), draft: values({ "booster.maxStock": 12, "booster.intervalMinutes": 5 }) }, stored);
    expect(res).toEqual({ ok: false, stale: ["booster.maxStock"] });
  });

  it("pas de conflit quand la base vaut déjà la valeur voulue, ni pour un simple ordre de clés", () => {
    expect(mergeSettingsSubmission(KEYS, { base: values(), draft: values({ "booster.maxStock": 12 }) }, values({ "booster.maxStock": 12 }))).toMatchObject({ ok: true });
    // jsonb ne garde pas l'ordre des clés d'objet
    const draft = values({ "booster.rates": { COMMON: 85, RARE: 15 } });
    const res = mergeSettingsSubmission(KEYS, { base: values(), draft }, values({ "booster.rates": { RARE: 10, COMMON: 90 } }));
    expect(res).toMatchObject({ ok: true, edited: ["booster.rates"] });
    expect(sameSettingValue({ a: 1, b: [{ c: 2, d: 3 }] }, { b: [{ d: 3, c: 2 }], a: 1 })).toBe(true);
    expect(sameSettingValue([1, 2], [2, 1])).toBe(false);
  });

  it("rien de modifié : rien à écrire, quoi qu'il y ait en base", () => {
    const stored = values({ "booster.maxStock": 99 });
    expect(mergeSettingsSubmission(KEYS, { base: values(), draft: values() }, stored)).toEqual({ ok: true, edited: [], merged: stored });
  });

  it("refuse un envoi sans base (ancien format) ou incomplet", () => {
    const schema = settingsSubmissionSchema(KEYS, settingsSchemaFor(KEYS));
    expect(schema.safeParse({ base: values(), draft: values() }).success).toBe(true);
    expect(schema.safeParse(values()).success).toBe(false);
    expect(schema.safeParse({ draft: values() }).success).toBe(false);
    expect(schema.safeParse({ base: { "booster.maxStock": 10 }, draft: values() }).success).toBe(false);
    expect(schema.safeParse({ base: values(), draft: values(), extra: 1 }).success).toBe(false);
  });
});

describe("brouillon d'un formulaire de réglages", () => {
  const initial = { a: 1, b: "x", c: [1] };

  it("une clé modifiée garde sa valeur de départ, une clé ramenée à la valeur en vigueur ne l'est plus", () => {
    let edits = editSettingsDraft(initial, {}, { ...initial, a: 2 });
    expect(settingsDraftState(initial, edits)).toEqual({ draft: { ...initial, a: 2 }, base: initial });
    edits = editSettingsDraft(initial, edits, { ...initial, a: 3 });
    expect(settingsDraftState(initial, edits).base.a).toBe(1);
    expect(editSettingsDraft(initial, edits, initial)).toEqual({});
  });

  it("page rafraîchie : les clés non modifiées suivent la base, les modifiées gardent leur départ", () => {
    const edits = editSettingsDraft(initial, {}, { ...initial, a: 2 });
    // Un autre a changé b (et a) entre-temps
    const fresh = { ...initial, a: 5, b: "y" };
    const { draft, base } = settingsDraftState(fresh, edits);
    expect(draft).toEqual({ a: 2, b: "y", c: [1] });
    // La base de a reste celle d'où l'admin est parti : le serveur verra le conflit
    expect(base).toEqual({ a: 1, b: "y", c: [1] });
    // Une modification qui rejoint la valeur en vigueur s'efface
    expect(settingsDraftState({ ...initial, a: 2 }, edits)).toEqual({ draft: { ...initial, a: 2 }, base: { ...initial, a: 2 } });
  });

  it("après un enregistrement : plus rien à relire, puis la valeur relue en base l'emporte", () => {
    const edits = editSettingsDraft(initial, {}, { ...initial, a: 2, c: [1, 2] });
    const sent = settingsDraftState(initial, edits);
    // Retouche de c pendant l'enregistrement : elle reste à relire, sur la base envoyée
    const during = editSettingsDraft(initial, edits, { ...sent.draft, c: [1, 2, 3] });
    const committed = commitSettingsEdits(during, sent);
    expect(settingsDraftState(initial, committed)).toEqual({ draft: { a: 2, b: "x", c: [1, 2, 3] }, base: { a: 2, b: "x", c: [1, 2] } });
    // Page rafraîchie : le serveur a retouché a (normalisation, révision…) ; la valeur relue s'affiche
    const fresh = { a: 20, b: "x", c: [1, 2] };
    expect(settingsDraftState(fresh, refreshedSettingsEdits(committed))).toEqual({ draft: { a: 20, b: "x", c: [1, 2, 3] }, base: fresh });
  });
});
