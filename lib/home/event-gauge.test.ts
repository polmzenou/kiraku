import { describe, expect, it } from "vitest";
import { eventGaugePhase, eventGaugeView } from "./event-gauge";

const startsAt = Date.parse("2026-11-04T18:00:00.000Z");
const endsAt = Date.parse("2026-11-10T18:00:00.000Z");
const eventWindow = { startsAt, endsAt, goal: 20_000 };

describe("eventGaugePhase", () => {
  it("suit la fenêtre [début, fin[", () => {
    expect(eventGaugePhase(startsAt, endsAt, startsAt - 1)).toBe("upcoming");
    expect(eventGaugePhase(startsAt, endsAt, startsAt)).toBe("live");
    expect(eventGaugePhase(startsAt, endsAt, endsAt - 1)).toBe("live");
    expect(eventGaugePhase(startsAt, endsAt, endsAt)).toBe("ended");
  });

  it("refuse des dates incohérentes", () => {
    expect(eventGaugePhase(endsAt, startsAt, startsAt)).toBeNull();
    expect(eventGaugePhase(startsAt, startsAt, startsAt)).toBeNull();
    expect(eventGaugePhase(Number.NaN, endsAt, startsAt)).toBeNull();
  });
});

describe("eventGaugeView", () => {
  it("n'affiche jamais 100 % avant l'objectif", () => {
    const view = eventGaugeView({ ...eventWindow, count: 19_999 }, startsAt);
    expect(view).toMatchObject({ percent: 99, reached: false });
    expect(view!.ratio).toBeLessThan(1);
  });

  it("borne la barre mais garde le vrai compte au-delà de l'objectif", () => {
    expect(eventGaugeView({ ...eventWindow, count: 25_000 }, startsAt)).toMatchObject({ count: 25_000, ratio: 1, percent: 100, reached: true });
  });

  it("atteint l'objectif pile à la valeur demandée", () => {
    expect(eventGaugeView({ ...eventWindow, count: 20_000 }, startsAt)).toMatchObject({ ratio: 1, percent: 100, reached: true });
  });

  it("part de zéro", () => {
    expect(eventGaugeView({ ...eventWindow, count: 0 }, startsAt - 1)).toMatchObject({ phase: "upcoming", ratio: 0, percent: 0, reached: false });
  });

  it("ne donne pas de jauge sans fenêtre ni objectif valides", () => {
    expect(eventGaugeView({ ...eventWindow, endsAt: startsAt, count: 0 }, startsAt)).toBeNull();
    expect(eventGaugeView({ ...eventWindow, goal: 0, count: 0 }, startsAt)).toBeNull();
  });
});
