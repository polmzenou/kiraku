import { describe, expect, it } from "vitest";
import { botTurnGraceMs, queueFreshSeconds, queueStaleSeconds } from "./timing";

describe("délais de la file", () => {
  it("au sondage par défaut (5 s), les seuils d'avant : 15 s et 60 s", () => {
    expect(queueFreshSeconds(5)).toBe(15);
    expect(queueStaleSeconds(5)).toBe(60);
  });

  it("un sondage lent élargit les deux seuils, la place reste libérée après l'appariement possible", () => {
    for (const poll of [2, 10, 30, 60]) {
      expect(queueFreshSeconds(poll)).toBeGreaterThan(2 * poll);
      expect(queueStaleSeconds(poll)).toBeGreaterThan(queueFreshSeconds(poll));
    }
    expect(queueFreshSeconds(60)).toBe(125);
    expect(queueStaleSeconds(60)).toBe(240);
  });
});

describe("botTurnGraceMs", () => {
  const actions = [
    { side: 0 as const, action: { type: "END_TURN" as const } },
    { side: 1 as const, action: { type: "ATTACK" as const } },
    { side: 1 as const, action: { type: "TECHNIQUE" as const } },
    { side: 1 as const, action: { type: "END_TURN" as const } },
  ];

  it("une marge par coup du bot, sans compter les fins de tour ni les coups du joueur", () => {
    expect(botTurnGraceMs(actions, 1, 1_500, 30)).toBe(3_000);
  });

  it("plafonnée à la durée d'un tour", () => {
    expect(botTurnGraceMs(actions, 1, 20_000, 30)).toBe(30_000);
  });

  it("rien sans bot ou à 0", () => {
    expect(botTurnGraceMs(actions, null, 1_500, 30)).toBe(0);
    expect(botTurnGraceMs(actions, 1, 0, 30)).toBe(0);
  });
});
