import { describe, expect, it } from "vitest";
import { pollAnswerSchema, pollTally } from "./poll";

describe("sondage Discord", () => {
  it("compte les oui et les non", () => {
    expect(pollTally([{ answer: true, count: 3 }, { answer: false, count: 1 }])).toEqual({ yes: 3, no: 1, total: 4, yesPercent: 75 });
  });
  it("vaut zéro sans réponse", () => {
    expect(pollTally([])).toEqual({ yes: 0, no: 0, total: 0, yesPercent: 0 });
  });
  it("n'accepte qu'un booléen", () => {
    expect(pollAnswerSchema.safeParse(true).success).toBe(true);
    expect(pollAnswerSchema.safeParse("oui").success).toBe(false);
  });
});
