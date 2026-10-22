import { describe, expect, it } from "vitest";
import { markWished } from "./wishlist";

describe("markWished", () => {
  it("marque seulement le premier exemplaire d'une carte souhaitée", () => {
    const cards = [{ cardId: "a" }, { cardId: "b" }, { cardId: "a" }, { cardId: "c" }];
    expect(markWished(cards, new Set(["a", "c"])).map((c) => c.wished)).toEqual([true, false, false, true]);
  });

  it("ne touche pas l'ensemble reçu", () => {
    const wished = new Set(["a"]);
    markWished([{ cardId: "a" }], wished);
    expect(wished.has("a")).toBe(true);
  });

  it("aucune carte souhaitée", () => {
    expect(markWished([{ cardId: "a" }], new Set()).map((c) => c.wished)).toEqual([false]);
  });
});
