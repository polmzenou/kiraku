import { describe, expect, it } from "vitest";
import { abilityWinRate, BALANCE_TARGETS } from "./balance";
import { NEW_KEYWORDS, NEW_TECHNIQUES } from "./types";

// Verrouille l'équilibrage des nouvelles capacités (pas des 14 d'origine, dont le comportement ne bouge pas).
// Déterministe : un échec veut dire qu'une valeur ou le moteur a changé, pas qu'on a joué de malchance.
const GAMES = 1_000;

describe("équilibrage des nouvelles capacités, une seule carte en miroir", { timeout: 120_000 }, () => {
  it.each(NEW_KEYWORDS)("le passif %s reste dans sa cible", (keyword) => {
    const rate = abilityWinRate({ keyword }, GAMES);
    expect(rate).toBeGreaterThanOrEqual(BALANCE_TARGETS.keyword.min);
    expect(rate).toBeLessThanOrEqual(BALANCE_TARGETS.keyword.max);
  });

  it.each(NEW_TECHNIQUES)("la technique %s reste dans sa cible", (technique) => {
    const rate = abilityWinRate({ technique }, GAMES);
    expect(rate).toBeGreaterThanOrEqual(BALANCE_TARGETS.technique.min);
    expect(rate).toBeLessThanOrEqual(BALANCE_TARGETS.technique.max);
  });
});
