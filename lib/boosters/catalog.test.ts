import { describe, expect, it } from "vitest";
import { choiceCount, effectiveChoice, MAX_OPEN_COUNT, openAllCount, parseOpenChoice } from "./catalog";

describe("ouvrir « Tous »", () => {
  it("ouvre tout ce qui reste, plafonné", () => {
    expect(openAllCount(4)).toBe(4);
    expect(openAllCount(MAX_OPEN_COUNT + 30)).toBe(MAX_OPEN_COUNT);
  });

  it("n'est proposé qu'à partir de 2 boosters", () => {
    expect(openAllCount(0)).toBe(0);
    expect(openAllCount(1)).toBe(0);
    expect(openAllCount(2)).toBe(2);
  });

  it("retombe sur ×1 quand il n'y a plus rien à ouvrir en masse", () => {
    expect(effectiveChoice("all", 10, 4)).toBe("all");
    expect(effectiveChoice("all", 10, 0)).toBe(1);
  });

  it("ramène un nombre fixe trop grand au plus grand ouvrable", () => {
    expect(effectiveChoice(10, 5, 0)).toBe(5);
    expect(effectiveChoice(5, 4, 4)).toBe(1);
    expect(effectiveChoice(5, 10, 0)).toBe(5);
  });

  it("compte les boosters d'un choix", () => {
    expect(choiceCount("all", 4)).toBe(4);
    expect(choiceCount(5, 4)).toBe(5);
  });

  it("lit le choix de l'URL", () => {
    expect(parseOpenChoice("all")).toBe("all");
    expect(parseOpenChoice("5")).toBe(5);
    expect(parseOpenChoice("7")).toBe(1);
    expect(parseOpenChoice(undefined)).toBe(1);
  });
});
