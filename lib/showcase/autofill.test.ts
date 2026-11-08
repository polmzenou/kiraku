import { describe, expect, it } from "vitest";
import { autofillSlots } from "./autofill";
import { legacyLayout } from "./legacy";

describe("remplissage automatique", () => {
  it("met les cartes les plus rares, puis les plus populaires, en tête", () => {
    const slots = autofillSlots(
      [
        { cardId: "commune", raritySort: 0, rank: 1 },
        { cardId: "mythique-b", raritySort: 500, rank: 40 },
        { cardId: "mythique-a", raritySort: 500, rank: 12 },
        { cardId: "sans-rang", raritySort: 500, rank: null },
        { cardId: "gold", raritySort: 700, rank: 900 },
      ],
      4,
    );
    expect(slots).toEqual(["gold", "mythique-a", "mythique-b", "sans-rang"]);
  });

  it("complète par des cases vides et ignore les doublons", () => {
    expect(autofillSlots([{ cardId: "a", raritySort: 1, rank: 1 }, { cardId: "a", raritySort: 1, rank: 1 }], 3)).toEqual(["a", null, null]);
  });
});

describe("reprise de l'ancienne vitrine", () => {
  it("garde les dispositions à 8 cartes d'une vitrine de 8 cases", () => {
    expect(legacyLayout("TRIPTYCH", 8, 8)).toBe("TRIPTYCH");
    expect(legacyLayout("CHECKER", 2, 8)).toBe("CHECKER");
  });

  it("reprend en grille une disposition qui ne s'appliquait pas (vitrine d'une autre taille)", () => {
    expect(legacyLayout("TRIPTYCH", 10, 10)).toBe("GRID_4X3");
    expect(legacyLayout("CHECKER", 3, 4)).toBe("GRID_2X2");
  });

  it("choisit la grille qui contient la plus haute case occupée", () => {
    expect(legacyLayout("GRID", 0, 4)).toBe("GRID_2X2");
    expect(legacyLayout("GRID", 4, 4)).toBe("GRID_2X2");
    expect(legacyLayout("GRID", 5, 6)).toBe("GRID_3X2");
    expect(legacyLayout("GRID", 8, 8)).toBe("GRID_4X2");
    expect(legacyLayout("GRID", 9, 12)).toBe("GRID_3X3");
    expect(legacyLayout("GRID", 12, 12)).toBe("GRID_4X3");
    expect(legacyLayout("GRID", 13, 20)).toBe("FRIEZE");
  });
});
