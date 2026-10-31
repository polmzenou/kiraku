import { describe, expect, it } from "vitest";
import {
  bidBounds,
  buyoutAvailable,
  checkListing,
  checkTrader,
  extendedEndsAt,
  listingEndsAt,
  minNextBid,
  priceCap,
  saleFee,
  sellerNet,
  sellInfoForRarity,
  type MarketRules,
  type SellBase,
} from "./rules";

const rules: MarketRules = {
  enabled: true,
  feeBp: 500,
  minIncrementBp: 500,
  antiSnipeSeconds: 120,
  extendSeconds: 120,
  durationsHours: [1, 6, 24, 48],
  maxActivePerSeller: 10,
  minAccountAgeHours: 48,
  minStartPrice: 1,
  maxPrice: 10_000_000,
  maxPriceByRarity: {},
};

describe("surenchère minimale", () => {
  it("vaut le prix de départ tant que personne n'a misé", () => {
    expect(minNextBid(null, 100, 500)).toBe(100);
  });

  it("ajoute 5 % arrondis au-dessus", () => {
    expect(minNextBid(100, 50, 500)).toBe(105);
    expect(minNextBid(101, 50, 500)).toBe(107); // 5,05 → 6
    expect(minNextBid(1_000, 50, 500)).toBe(1_050);
  });

  it("ajoute toujours au moins 1 Zeni", () => {
    expect(minNextBid(1, 1, 500)).toBe(2);
    expect(minNextBid(10, 1, 0)).toBe(11);
  });
});

describe("taxe de vente", () => {
  it("prélève 5 % arrondis au-dessus", () => {
    expect(saleFee(100, 500)).toBe(5);
    expect(saleFee(101, 500)).toBe(6);
    expect(sellerNet(101, 500)).toBe(95);
  });

  it("ne dépasse jamais le prix", () => {
    expect(saleFee(1, 500)).toBe(1);
    expect(saleFee(1, 10_000)).toBe(1);
    expect(sellerNet(1, 500)).toBe(0);
  });

  it("est nulle si le taux l'est", () => {
    expect(saleFee(500, 0)).toBe(0);
  });
});

describe("anti-sniping", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  const at = (s: number) => new Date(now.getTime() + s * 1000);

  it("ne change rien hors des 2 dernières minutes", () => {
    expect(extendedEndsAt(at(120), now, 120, 120)).toEqual(at(120));
    expect(extendedEndsAt(at(3600), now, 120, 120)).toEqual(at(3600));
  });

  it("repousse la fin à maintenant + 2 min", () => {
    expect(extendedEndsAt(at(60), now, 120, 120)).toEqual(at(120));
    expect(extendedEndsAt(at(1), now, 120, 120)).toEqual(at(120));
  });

  it("ne raccourcit jamais une vente", () => {
    expect(extendedEndsAt(at(100), now, 120, 30)).toEqual(at(100));
  });
});

describe("mise en vente", () => {
  it("accepte une vente valide", () => {
    expect(checkListing({ startPrice: 100, buyoutPrice: null, durationHours: 24 }, rules)).toBeNull();
    expect(checkListing({ startPrice: 100, buyoutPrice: 101, durationHours: 1 }, rules)).toBeNull();
  });

  it("refuse un prix hors bornes ou décimal", () => {
    expect(checkListing({ startPrice: 0, buyoutPrice: null, durationHours: 24 }, rules)).toBe("INVALID_PRICE");
    expect(checkListing({ startPrice: 1.5, buyoutPrice: null, durationHours: 24 }, rules)).toBe("INVALID_PRICE");
    expect(checkListing({ startPrice: 10_000_001, buyoutPrice: null, durationHours: 24 }, rules)).toBe("INVALID_PRICE");
  });

  it("exige un achat immédiat au-dessus du prix de départ", () => {
    expect(checkListing({ startPrice: 100, buyoutPrice: 100, durationHours: 24 }, rules)).toBe("INVALID_BUYOUT");
    expect(checkListing({ startPrice: 100, buyoutPrice: 20_000_000, durationHours: 24 }, rules)).toBe("INVALID_BUYOUT");
  });

  it("n'accepte que les durées réglées", () => {
    expect(checkListing({ startPrice: 100, buyoutPrice: null, durationHours: 12 }, rules)).toBe("INVALID_DURATION");
  });

  it("calcule la fin", () => {
    const now = new Date("2026-10-15T12:00:00Z");
    expect(listingEndsAt(now, 6)).toEqual(new Date("2026-10-15T18:00:00Z"));
  });
});

describe("qui peut vendre et miser", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  const old = new Date("2026-10-01T00:00:00Z");

  it("accepte un compte inscrit de plus de 48 h", () => {
    expect(checkTrader({ isGuest: false, bannedAt: null, createdAt: old }, now, rules)).toBeNull();
  });

  it("refuse invités, bannis et comptes récents", () => {
    expect(checkTrader({ isGuest: true, bannedAt: null, createdAt: old }, now, rules)).toBe("GUEST");
    expect(checkTrader({ isGuest: false, bannedAt: old, createdAt: old }, now, rules)).toBe("BANNED");
    const young = new Date(now.getTime() - 47 * 3_600_000);
    expect(checkTrader({ isGuest: false, bannedAt: null, createdAt: young }, now, rules)).toBe("TOO_NEW");
  });

  it("refuse tout quand le marché est coupé", () => {
    expect(checkTrader({ isGuest: false, bannedAt: null, createdAt: old }, now, { ...rules, enabled: false })).toBe("DISABLED");
  });
});

describe("achat immédiat", () => {
  it("reste proposé tant qu'aucune mise ne l'atteint", () => {
    expect(buyoutAvailable(500, null)).toBe(true);
    expect(buyoutAvailable(500, 499)).toBe(true);
    expect(buyoutAvailable(500, 500)).toBe(false);
    expect(buyoutAvailable(null, null)).toBe(false);
  });
});

describe("plafond par rareté", () => {
  const capped = { ...rules, maxPriceByRarity: { COMMON: 500, MYTHIC: 50_000_000 } };

  it("prend le plus bas du plafond global et de celui de la rareté", () => {
    expect(priceCap(capped, "COMMON")).toBe(500);
    expect(priceCap(capped, "MYTHIC")).toBe(10_000_000);
    expect(priceCap(capped, "RARE")).toBe(10_000_000);
    expect(priceCap(capped, null)).toBe(10_000_000);
  });

  it("borne le prix de départ et l'achat immédiat", () => {
    expect(checkListing({ startPrice: 500, buyoutPrice: null, durationHours: 24 }, capped, "COMMON")).toBeNull();
    expect(checkListing({ startPrice: 501, buyoutPrice: null, durationHours: 24 }, capped, "COMMON")).toBe("INVALID_PRICE");
    expect(checkListing({ startPrice: 100, buyoutPrice: 600, durationHours: 24 }, capped, "COMMON")).toBe("INVALID_BUYOUT");
    expect(checkListing({ startPrice: 501, buyoutPrice: null, durationHours: 24 }, capped, "RARE")).toBeNull();
  });

  it("ramène la mise minimale au plafond, puis ferme les mises", () => {
    expect(bidBounds(null, 100, 500, 500)).toEqual({ min: 100, max: 500 });
    expect(bidBounds(400, 100, 500, 500)).toEqual({ min: 420, max: 500 });
    expect(bidBounds(490, 100, 500, 500)).toEqual({ min: 500, max: 500 }); // 490 + 5 % dépasserait
    expect(bidBounds(500, 100, 500, 500)).toBeNull();
  });

  it("garde le prix de départ d'une vente ouverte avant une baisse du plafond", () => {
    expect(bidBounds(null, 800, 500, 500)).toEqual({ min: 800, max: 800 });
    expect(bidBounds(800, 800, 500, 500)).toBeNull();
  });
});

describe("feuille « Mettre en vente » depuis le Marché", () => {
  const base: SellBase = {
    durationsHours: [1, 24],
    feeBp: 500,
    minStartPrice: 1,
    maxPrice: 10_000_000,
    maxPriceByRarity: { COMMON: 500, MYTHIC: 50_000_000 },
    active: 2,
    maxActive: 10,
    minAccountAgeHours: 48,
    block: null,
  };

  it("applique le plafond de la rareté de la carte choisie", () => {
    expect(sellInfoForRarity(base, "COMMON")).toMatchObject({ maxPrice: 500, rarityCapped: true });
    expect(sellInfoForRarity(base, "MYTHIC")).toMatchObject({ maxPrice: 10_000_000, rarityCapped: false });
    expect(sellInfoForRarity(base, "RARE")).toMatchObject({ maxPrice: 10_000_000, rarityCapped: false });
  });

  it("garde le reste et n'envoie pas la table des plafonds", () => {
    const info = sellInfoForRarity(base, "COMMON");
    expect(info).toMatchObject({ durationsHours: [1, 24], feeBp: 500, active: 2, maxActive: 10, block: null });
    expect(info).not.toHaveProperty("maxPriceByRarity");
  });
});
