import { describe, expect, it } from "vitest";
import { stillDrawable, type LiveCard } from "./drawable";

describe("revérification d'une carte tirée", () => {
  const pool = new Set(["aki", "denji", "makima-ar-cochee"]);
  const ctx = { typeId: "standard", inPool: (id: string) => pool.has(id) };
  const drawn = { rarity: "AR", weight: 1 };
  const live = (extra: Partial<LiveCard> = {}): LiveCard => ({
    status: "PUBLISHED", rarity: "AR", dropWeight: 1, origin: "CUSTOM", boosterIds: [], variantOfId: "aki", boosterExclusive: false, ...extra,
  });

  it("une AR qui suit sa carte de base passe sans être cochée pour le type", () => {
    expect(stillDrawable(live(), drawn, ctx)).toBe(true);
  });

  it("une AR cochée pour le type passe, même si sa base n'est pas au pool", () => {
    expect(stillDrawable(live({ variantOfId: "hors-pool", boosterIds: ["standard"] }), drawn, ctx)).toBe(true);
  });

  it("une AR exclusive ou dont la base a quitté le pool est refusée si elle n'est pas cochée", () => {
    expect(stillDrawable(live({ boosterExclusive: true }), drawn, ctx)).toBe(false);
    expect(stillDrawable(live({ variantOfId: "hors-pool" }), drawn, ctx)).toBe(false);
  });

  it("une création originale qui n'est pas une variante doit être cochée", () => {
    expect(stillDrawable(live({ variantOfId: null }), drawn, ctx)).toBe(false);
    expect(stillDrawable(live({ variantOfId: null, boosterIds: ["standard"] }), drawn, ctx)).toBe(true);
  });

  it("une carte AniList n'a rien à cocher", () => {
    expect(stillDrawable(live({ origin: "ANILIST", rarity: "EPIC", variantOfId: null }), { rarity: "EPIC", weight: 1 }, ctx)).toBe(true);
  });

  it("dépubliée, changée de rareté ou de poids depuis le calcul du pool : refusée", () => {
    expect(stillDrawable(undefined, drawn, ctx)).toBe(false);
    expect(stillDrawable(live({ status: "ARCHIVED" }), drawn, ctx)).toBe(false);
    expect(stillDrawable(live({ rarity: "GOLD" }), drawn, ctx)).toBe(false);
    expect(stillDrawable(live({ dropWeight: 0 }), { rarity: "AR", weight: 0 }, ctx)).toBe(false);
    expect(stillDrawable(live({ dropWeight: 3 }), drawn, ctx)).toBe(false);
  });
});
