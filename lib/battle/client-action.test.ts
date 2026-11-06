import { describe, expect, it } from "vitest";
import { clientActionSchema } from "./client-action";

describe("action envoyée par le client", () => {
  it("accepte l'ulti, avec ou sans cible", () => {
    expect(clientActionSchema.parse({ type: "ULTIMATE", actor: 2 })).toEqual({ type: "ULTIMATE", actor: 2 });
    expect(clientActionSchema.parse({ type: "ULTIMATE", actor: 0, target: 1 })).toEqual({ type: "ULTIMATE", actor: 0, target: 1 });
  });

  it("refuse un camp, un effet, un ulti nommé ou un index hors de l'équipe", () => {
    for (const bad of [
      { type: "ULTIMATE", actor: 0, side: 1 },
      { type: "ULTIMATE", actor: 0, ultimate: "TENCHU" },
      { type: "ULTIMATE", actor: 0, charge: 100 },
      { type: "ULTIMATE", actor: 3 },
      { type: "ULTIMATE", actor: -1 },
      { type: "ULTIMATE", actor: 0, target: 1.5 },
      { type: "ULTIMATE" },
      { type: "ULTIMATE", actor: "0" },
    ]) {
      expect(clientActionSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("garde les actions d'avant telles quelles", () => {
    expect(clientActionSchema.parse({ type: "ATTACK", actor: 0, target: 2 })).toEqual({ type: "ATTACK", actor: 0, target: 2 });
    expect(clientActionSchema.parse({ type: "TECHNIQUE", actor: 1 })).toEqual({ type: "TECHNIQUE", actor: 1 });
    expect(clientActionSchema.parse({ type: "END_TURN" })).toEqual({ type: "END_TURN" });
    expect(clientActionSchema.safeParse({ type: "ATTACK", actor: 0 }).success).toBe(false);
    expect(clientActionSchema.safeParse({ type: "TIMEOUT" }).success).toBe(false);
  });
});
