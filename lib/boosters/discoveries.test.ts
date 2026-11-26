import { describe, expect, it } from "vitest";
import { discoveriesToRecord } from "./discoveries";

describe("découvertes écrites après un tirage", () => {
  const seenAt = new Date("2026-11-01T10:00:00Z");

  it("une carte jamais obtenue est écrite, une carte déjà découverte ne l'est pas", () => {
    expect(discoveriesToRecord(["gojo", "aki"], [{ cardId: "aki", regainedAt: seenAt }], 0)).toEqual(["gojo"]);
  });

  it("un premier tirage écrit toutes ses cartes, chacune une fois", () => {
    expect(discoveriesToRecord(["gojo", "aki", "gojo"], [], 0)).toEqual(["gojo", "aki"]);
  });

  it("au prestige 1 ou plus, une carte d'un cycle passé pas encore retrouvée est écrite (tampon « Retrouvée »)", () => {
    const known = [{ cardId: "aki", regainedAt: null }, { cardId: "denji", regainedAt: seenAt }];
    expect(discoveriesToRecord(["aki", "denji"], known, 2)).toEqual(["aki"]);
  });

  it("sans prestige, une découverte sans date de retrouvaille ne compte pas comme une retrouvaille", () => {
    expect(discoveriesToRecord(["aki"], [{ cardId: "aki", regainedAt: null }], 0)).toEqual([]);
  });

  it("un tirage sans nouveauté n'écrit rien", () => {
    expect(discoveriesToRecord(["aki"], [{ cardId: "aki", regainedAt: seenAt }], 3)).toEqual([]);
  });
});
