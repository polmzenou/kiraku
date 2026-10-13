import { describe, expect, it } from "vitest";
import { cardNumber, seriesTitle } from "./display";

describe("affichage des cartes", () => {
  it("numérote sur quatre chiffres", () => {
    expect(cardNumber(1)).toBe("0001");
    expect(cardNumber(6736)).toBe("6736");
    expect(cardNumber(12345)).toBe("12345");
    expect(cardNumber(null)).toBe("—");
  });

  it("choisit le titre de série selon la langue", () => {
    const series = { titleRomaji: "Shingeki no Kyojin", titleEnglish: "Attack on Titan" };
    expect(seriesTitle(series, "fr")).toBe("Shingeki no Kyojin");
    expect(seriesTitle(series, "en")).toBe("Attack on Titan");
    expect(seriesTitle({ ...series, titleEnglish: null }, "en")).toBe("Shingeki no Kyojin");
  });
});
