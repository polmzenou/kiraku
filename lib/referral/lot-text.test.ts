import { describe, expect, it } from "vitest";
import { boosterWord, lotText } from "./lot-text";

const rarity = (key: string) => ({ MYTHIC: "Mythique", LEGENDARY: "Légendaire" })[key] ?? key;

describe("boosterWord", () => {
  it("retire le mot « booster » déjà écrit par le texte", () => {
    expect(boosterWord("Booster divin")).toBe("divin");
    expect(boosterWord("Divine booster")).toBe("Divine");
    expect(boosterWord("booster  Mythique")).toBe("Mythique");
  });

  it("garde les autres noms tels quels, et le nom fait du seul mot « booster »", () => {
    expect(boosterWord("Tout anime")).toBe("Tout anime");
    expect(boosterWord("Boosterland")).toBe("Boosterland");
    expect(boosterWord("Booster")).toBe("Booster");
  });
});

describe("lotText", () => {
  it("écrit chaque ligne, puis les Zeni, avec le multiplicateur de l'Ennichi", () => {
    const lot = {
      zeni: 1000,
      lines: [
        { kind: "BOOSTER" as const, quantity: 1, name: "Booster divin" },
        { kind: "BOOSTER" as const, quantity: 10, name: "Tout anime" },
        { kind: "RARITY_CARD" as const, quantity: 1, rarity: "MYTHIC" },
        { kind: "CARD" as const, quantity: 1, name: "Rem" },
      ],
    };
    expect(lotText(lot, rarity)).toBe("1 booster divin · 10 boosters Tout anime · 1 carte Mythique au hasard · Rem · 1 000 Zeni");
    expect(lotText(lot, rarity, 2)).toBe("2 boosters divin · 20 boosters Tout anime · 2 cartes Mythique au hasard · 2 × Rem · 2 000 Zeni");
  });

  it("rend null pour un lot absent ou vide", () => {
    expect(lotText(null, rarity)).toBeNull();
    expect(lotText({ zeni: 0, lines: [] }, rarity)).toBeNull();
  });
});
