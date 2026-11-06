import { describe, expect, it } from "vitest";
import { ONE_LINE_MAX, titleLines, titleSizeCqi, titleText } from "./reveal-title";

describe("nom d'une grande rareté au-dessus de la carte", () => {
  it("garde les noms courts sur une ligne, en capitales", () => {
    expect(titleLines("Légendaire")).toEqual(["LÉGENDAIRE"]);
    expect(titleLines("Mythique")).toEqual(["MYTHIQUE"]);
    expect(titleLines("Black Rare")).toEqual(["BLACK RARE"]);
    expect(titleLines("Gold")).toEqual(["GOLD"]);
  });

  it("coupe « Mythique Black Edition » entre les mots, la ligne longue en bas", () => {
    expect(titleLines("Mythique Black Edition")).toEqual(["MYTHIQUE", "BLACK EDITION"]);
    expect(titleLines("Mythic Black Edition")).toEqual(["MYTHIC", "BLACK EDITION"]);
  });

  it("passe à 3 lignes seulement quand 2 ne suffisent pas, jamais plus", () => {
    expect(titleLines("Légendaire Suprême Céleste Ultime")).toEqual(["LÉGENDAIRE", "SUPRÊME", "CÉLESTE ULTIME"]);
    const many = titleLines("Un deux trois quatre cinq six sept huit neuf dix onze douze");
    expect(many.length).toBe(3);
    expect(many.join(" ")).toBe(titleText("Un deux trois quatre cinq six sept huit neuf dix onze douze"));
  });

  it("ne coupe jamais un mot, et nettoie les espaces saisis dans l'admin", () => {
    expect(titleLines("  Anticonstitutionnellement  ")).toEqual(["ANTICONSTITUTIONNELLEMENT"]);
    expect(titleLines("Mythique   Black\tEdition")).toEqual(["MYTHIQUE", "BLACK EDITION"]);
    expect(titleText(" a  b ")).toBe("A B");
    expect(titleLines("   ")).toEqual([]);
  });

  it("chaque ligne reste sous la limite dès qu'une coupe le permet", () => {
    for (const name of ["Mythique Black Edition", "Légendaire Suprême Céleste Ultime", "Mythic Black Edition", "Very Rare Variant Edition"]) {
      for (const line of titleLines(name)) expect(Array.from(line).length).toBeLessThanOrEqual(ONE_LINE_MAX + 1);
    }
  });

  it("taille : celle d'avant pour un nom court, plus petite pour une ligne longue, toujours dans la largeur", () => {
    expect(titleSizeCqi(["MYTHIQUE"])).toBe(10);
    expect(titleSizeCqi(["MYTHIQUE", "BLACK EDITION"])).toBeLessThan(10);
    expect(titleSizeCqi(["ANTICONSTITUTIONNELLEMENT"])).toBeLessThan(titleSizeCqi(["BLACK EDITION"]));
    // Ligne la plus longue × largeur d'un caractère : jamais plus que la place laissée au texte
    for (const lines of [["MYTHIQUE"], ["MYTHIQUE", "BLACK EDITION"], ["ANTICONSTITUTIONNELLEMENT"], ["LÉGENDAIRE"]]) {
      const longest = Math.max(...lines.map((l) => Array.from(l).length));
      expect(longest * 0.85 * titleSizeCqi(lines)).toBeLessThanOrEqual(84.01);
    }
  });
});
