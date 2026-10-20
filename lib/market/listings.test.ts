import { describe, expect, it } from "vitest";
import {
  checkTradeListing,
  checkExchanger,
  checkListingOffer,
  isListingOpen,
  listingExpiresAt,
  parseListingFilter,
  uniqueWants,
  type TradeListingCheck,
  type ListingRules,
  type ListingOfferCheck,
} from "./listings";

const rules: ListingRules = {
  expiryHours: 48,
  maxWants: 3,
  maxActive: 2,
  perDay: 5,
  maxPendingOffers: 2,
  allowOther: true,
  allowedRarities: ["COMMON", "RARE", "MYTHIC"],
  minAccountAgeHours: 48,
};

const now = new Date("2026-10-20T12:00:00Z");

const listing: TradeListingCheck = {
  offered: { cardId: "lust", rarity: "RARE" },
  wants: [
    { cardId: "a", rarity: "COMMON" },
    { cardId: "b", rarity: "MYTHIC" },
  ],
  ownedWants: 0,
  duplicate: false,
  active: 0,
  createdLastDay: 0,
  rules,
};

describe("annonce d'échange", () => {
  it("accepte une annonce dans les limites", () => {
    expect(checkTradeListing(listing)).toBeNull();
  });

  it.each([
    [{ wants: [] }, "NO_WANT"],
    [{ wants: ["a", "b", "c", "d"].map((cardId) => ({ cardId, rarity: "COMMON" as const })) }, "TOO_MANY_WANTS"],
    [{ wants: [{ cardId: "lust", rarity: "RARE" as const }] }, "SAME_CARD"],
    [{ ownedWants: 1 }, "ALREADY_OWNED"],
    [{ offered: { cardId: "x", rarity: "EPIC" as const } }, "RARITY"],
    [{ wants: [{ cardId: "y", rarity: "LEGENDARY" as const }] }, "RARITY"],
    [{ duplicate: true }, "DUPLICATE"],
    [{ active: 2 }, "ACTIVE_LIMIT"],
    [{ createdLastDay: 5 }, "DAILY_LIMIT"],
  ] as const)("refuse %o → %s", (patch, code) => {
    expect(checkTradeListing({ ...listing, ...patch })).toBe(code);
  });
});

const offer: ListingOfferCheck = {
  listing: { ownerId: "owner", cardId: "lust", status: "OPEN", expiresAt: new Date(now.getTime() + 3_600_000) },
  bidderId: "bidder",
  offered: { cardId: "a", rarity: "COMMON" },
  fromWants: true,
  blocked: false,
  alreadyOffered: false,
  pendingOffers: 0,
  rules,
  now,
};

describe("offre sur une annonce", () => {
  it("accepte une carte demandée", () => {
    expect(checkListingOffer(offer)).toBeNull();
  });

  it("accepte une carte hors liste quand c'est permis", () => {
    expect(checkListingOffer({ ...offer, fromWants: false, offered: { cardId: "z", rarity: "RARE" } })).toBeNull();
  });

  it.each([
    [{ bidderId: "owner" }, "OWN_LISTING"],
    [{ listing: { ...offer.listing, status: "TRADED" } }, "CLOSED"],
    [{ listing: { ...offer.listing, expiresAt: now } }, "CLOSED"],
    [{ blocked: true }, "BLOCKED"],
    [{ offered: { cardId: "lust", rarity: "RARE" as const } }, "SAME_CARD"],
    [{ fromWants: false, rules: { ...rules, allowOther: false } }, "NOT_WANTED"],
    [{ offered: { cardId: "e", rarity: "EPIC" as const } }, "RARITY"],
    [{ alreadyOffered: true }, "ALREADY_OFFERED"],
    [{ pendingOffers: 2 }, "OFFER_LIMIT"],
  ] as const)("refuse %o → %s", (patch, code) => {
    expect(checkListingOffer({ ...offer, ...patch })).toBe(code);
  });
});

describe("joueur", () => {
  const old = new Date(now.getTime() - 72 * 3_600_000);
  it.each([
    [{ isGuest: false, bannedAt: null, createdAt: old }, null],
    [{ isGuest: true, bannedAt: null, createdAt: old }, "GUEST"],
    [{ isGuest: false, bannedAt: now, createdAt: old }, "BANNED"],
    [{ isGuest: false, bannedAt: null, createdAt: new Date(now.getTime() - 3_600_000) }, "TOO_NEW"],
  ] as const)("%o → %s", (player, code) => {
    expect(checkExchanger(player, now, rules)).toBe(code);
  });
});

describe("outils", () => {
  it("dédoublonne les cartes demandées dans l'ordre", () => {
    expect(uniqueWants(["b", "a", "b"])).toEqual(["b", "a"]);
  });

  it("calcule l'échéance et l'ouverture", () => {
    const end = listingExpiresAt(now, 48);
    expect(end.getTime() - now.getTime()).toBe(48 * 3_600_000);
    expect(isListingOpen({ status: "OPEN", expiresAt: end }, now)).toBe(true);
    expect(isListingOpen({ status: "OPEN", expiresAt: end }, end)).toBe(false);
    expect(isListingOpen({ status: "CANCELLED", expiresAt: end }, now)).toBe(false);
  });

  it("lit le filtre de l'URL", () => {
    expect(parseListingFilter("canAccept")).toBe("canAccept");
    expect(parseListingFilter(["mine", "all"])).toBe("mine");
    expect(parseListingFilter("nimporte")).toBe("all");
    expect(parseListingFilter(undefined)).toBe("all");
  });
});
