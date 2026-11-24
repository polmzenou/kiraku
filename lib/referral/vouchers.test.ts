import { describe, expect, it } from "vitest";
import { parseVoucherFilter, pickVoucherGroup, voucherCardProblem, voucherGroups, voucherMilestones, voucherParam } from "./vouchers";

const at = (n: number) => new Date(Date.UTC(2026, 10, n));

describe("bons du parrainage", () => {
  it("une Mythique publiée pour « Mythique au choix », toute carte publiée pour la 1/1", () => {
    expect(voucherCardProblem("MYTHIC_CHOICE", { status: "PUBLISHED", rarity: "MYTHIC" })).toBeNull();
    expect(voucherCardProblem("MYTHIC_CHOICE", { status: "PUBLISHED", rarity: "LEGENDARY" })).toBe("NOT_MYTHIC");
    // Une variante de rang supérieur (Black Edition…) n'est pas une Mythique
    expect(voucherCardProblem("MYTHIC_CHOICE", { status: "PUBLISHED", rarity: "BR" })).toBe("NOT_MYTHIC");
    expect(voucherCardProblem("ONE_OF_ONE", { status: "PUBLISHED", rarity: "COMMON" })).toBeNull();
    expect(voucherCardProblem("ONE_OF_ONE", { status: "RETIRED", rarity: "MYTHIC" })).toBe("CARD_UNAVAILABLE");
    expect(voucherCardProblem("MYTHIC_CHOICE", { status: "DRAFT", rarity: "MYTHIC" })).toBe("CARD_UNAVAILABLE");
    expect(voucherCardProblem("ONE_OF_ONE", null)).toBe("CARD_UNAVAILABLE");
  });

  it("regroupe les bons par type, Mythique d'abord, et utilise le plus ancien", () => {
    const groups = voucherGroups([
      { id: "c", kind: "ONE_OF_ONE", createdAt: at(3) },
      { id: "b", kind: "MYTHIC_CHOICE", createdAt: at(5) },
      { id: "a", kind: "MYTHIC_CHOICE", createdAt: at(2) },
    ]);
    expect(groups).toEqual([
      { kind: "MYTHIC_CHOICE", count: 2, voucherId: "a" },
      { kind: "ONE_OF_ONE", count: 1, voucherId: "c" },
    ]);
    expect(voucherGroups([])).toEqual([]);
  });

  it("onglet demandé dans l'adresse, sinon le premier", () => {
    const groups = voucherGroups([
      { id: "a", kind: "MYTHIC_CHOICE", createdAt: at(1) },
      { id: "c", kind: "ONE_OF_ONE", createdAt: at(1) },
    ]);
    expect(pickVoucherGroup(groups, "one")?.voucherId).toBe("c");
    expect(pickVoucherGroup(groups, ["mythic"])?.voucherId).toBe("a");
    expect(pickVoucherGroup(groups, "n'importe quoi")?.voucherId).toBe("a");
    expect(pickVoucherGroup(groups.slice(1), "mythic")?.voucherId).toBe("c");
    expect(pickVoucherGroup([], "one")).toBeNull();
    expect(voucherParam("ONE_OF_ONE")).toBe("one");
    expect(voucherParam("MYTHIC_CHOICE")).toBe("mythic");
  });

  it("filtre de la grille, « toutes » par défaut", () => {
    expect(parseVoucherFilter("free")).toBe("free");
    expect(parseVoucherFilter(["series"])).toBe("series");
    expect(parseVoucherFilter("owned")).toBe("all");
    expect(parseVoucherFilter(undefined)).toBe("all");
  });

  it("paliers qui donnent un bon", () => {
    expect(voucherMilestones([
      { installed: 1, choiceVouchers: 0, oneOfOne: false },
      { installed: 5, choiceVouchers: 1, oneOfOne: false },
      { installed: 100, choiceVouchers: 0, oneOfOne: true },
    ])).toEqual([5, 100]);
  });
});
