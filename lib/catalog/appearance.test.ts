import { describe, expect, it } from "vitest";
import { APPEARANCE_DEFAULTS, resolveAppearance } from "./appearance";

describe("resolveAppearance", () => {
  it("applique la rareté puis la carte par-dessus les valeurs par défaut", () => {
    const visual = resolveAppearance({ frame: "#112233", zoom: 2 }, { zoom: 1.5 });
    expect(visual).toMatchObject({ ...APPEARANCE_DEFAULTS, frame: "#112233", zoom: 1.5 });
  });

  it("réutilise le résultat pour les mêmes objets, et suit un nouvel objet", () => {
    const base = { frame: "#112233" };
    const card = { zoom: 2 };
    expect(resolveAppearance(base, card)).toBe(resolveAppearance(base, card));
    expect(resolveAppearance(base, { zoom: 3 }).zoom).toBe(3);
    expect(resolveAppearance(undefined, null)).toBe(resolveAppearance(undefined, undefined));
  });

  it("ignore une apparence invalide", () => {
    expect(resolveAppearance({ zoom: 99 }, "oops").zoom).toBe(APPEARANCE_DEFAULTS.zoom);
  });
});
