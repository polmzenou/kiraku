import { describe, expect, it } from "vitest";
import { creditPageMode } from "./credit-page";
import type { Availability } from "./types";

const none = { credits: 0, hadCredit: false, ownSachet: false };

describe("page d'ouverture d'un type", () => {
  it("affiche et vend un type ouvert, avec ou sans crédit", () => {
    expect(creditPageMode({ ...none, availability: "open" })).toEqual({ show: true, sellable: true });
    expect(creditPageMode({ ...none, availability: "open", credits: 3 })).toEqual({ show: true, sellable: true });
    expect(creditPageMode({ ...none, availability: "open", hadCredit: true })).toEqual({ show: true, sellable: true });
  });

  it("affiche un type réservé aux événements sans jamais le vendre", () => {
    expect(creditPageMode({ ...none, availability: "locked" })).toEqual({ show: true, sellable: false });
    expect(creditPageMode({ ...none, availability: "locked", credits: 2 })).toEqual({ show: true, sellable: false });
  });

  it("masque un type caché sans crédit, ni passé ni présent, ni sachet", () => {
    expect(creditPageMode({ ...none, availability: "hidden" })).toEqual({ show: false, sellable: false });
  });

  it("ouvre les crédits d'un type caché sans le vendre", () => {
    expect(creditPageMode({ ...none, availability: "hidden", credits: 1 })).toEqual({ show: true, sellable: false });
  });

  it("garde la page après le dernier crédit d'un type caché (refresh pendant le récap)", () => {
    expect(creditPageMode({ ...none, availability: "hidden", hadCredit: true })).toEqual({ show: true, sellable: false });
  });

  it("garde la page du sachet scellé du joueur, même déjà ouvert", () => {
    expect(creditPageMode({ ...none, availability: "hidden", ownSachet: true })).toEqual({ show: true, sellable: false });
  });

  it("ne vend qu'un type ouvert et ne masque qu'un type caché sans rien à ouvrir, dans tous les cas", () => {
    const availabilities: Availability[] = ["open", "locked", "hidden"];
    for (const availability of availabilities) {
      for (const credits of [0, 1, 5]) {
        for (const hadCredit of [false, true]) {
          for (const ownSachet of [false, true]) {
            const mode = creditPageMode({ availability, credits, hadCredit, ownSachet });
            const nothing = credits === 0 && !hadCredit && !ownSachet;
            expect(mode).toEqual({ show: availability !== "hidden" || !nothing, sellable: availability === "open" });
          }
        }
      }
    }
  });
});
