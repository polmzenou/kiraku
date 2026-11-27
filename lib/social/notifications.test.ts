import { describe, expect, it } from "vitest";
import {
  formatBadge,
  parseAuctionPayload,
  parseBuyOrderPayload,
  parseCoinFlipPayload,
  parseGiftPayload,
  parseKyaraImportPayload,
  parseReferralRewardPayload,
  parseTeamGiftPayload,
  hasPlayerNote,
  hiddenWhenBlocked,
  KEPT_WHEN_BLOCKED,
  NOTIFICATION_TYPES,
} from "./notifications";

describe("notifications d'un joueur bloqué", () => {
  it("cache ce qu'il envoie de lui-même : demande, cadeau, invitation, proposition, offre, alerte d'avis", () => {
    for (const type of ["FRIEND_REQUEST", "GIFT_RECEIVED", "BATTLE_INVITE", "TRADE_PROPOSED", "LISTING_OFFER", "COINFLIP_INVITE", "BUY_ORDER_WANTED"] as const) {
      expect(hiddenWhenBlocked(type)).toBe(true);
    }
  });

  it("garde ce qui parle des biens du lecteur : surenchère, vente, échange conclu, table relevée, lot de l'équipe", () => {
    for (const type of ["OUTBID", "AUCTION_SOLD", "AUCTION_WON", "TRADE_ACCEPTED", "LISTING_ACCEPTED", "COINFLIP_RESOLVED", "BUY_ORDER_FILLED", "LOT_GRANTED", "TEAM_GIFT", "REFERRAL_REWARD"] as const) {
      expect(hiddenWhenBlocked(type)).toBe(false);
      expect(KEPT_WHEN_BLOCKED).toContain(type);
    }
  });

  it("partage tous les types entre cachés et gardés", () => {
    expect(KEPT_WHEN_BLOCKED.length + NOTIFICATION_TYPES.filter(hiddenWhenBlocked).length).toBe(NOTIFICATION_TYPES.length);
  });

  it("ne garde jamais le mot libre d'un refus écrit par le joueur bloqué", () => {
    expect(hasPlayerNote("TRADE_DECLINED")).toBe(true);
    expect(hasPlayerNote("LISTING_DECLINED")).toBe(true);
    expect(hasPlayerNote("TEAM_GIFT")).toBe(false); // mot de l'équipe
  });
});

describe("formatBadge", () => {
  it("cache la pastille à zéro et plafonne à 9+", () => {
    expect(formatBadge(0)).toBeNull();
    expect(formatBadge(-1)).toBeNull();
    expect(formatBadge(3)).toBe("3");
    expect(formatBadge(9)).toBe("9");
    expect(formatBadge(10)).toBe("9+");
  });
});

describe("parseAuctionPayload", () => {
  it("garde la marque d'une vente annulée par les verrous du parrainage, seulement si elle vaut true", () => {
    expect(parseAuctionPayload({ auctionId: "a1", cardId: "c1", amount: 300 })).toEqual({ auctionId: "a1", cardId: "c1", amount: 300 });
    expect(parseAuctionPayload({ auctionId: "a1", cardId: "c1", amount: 300, locked: true })).toEqual({ auctionId: "a1", cardId: "c1", amount: 300, locked: true });
    expect(parseAuctionPayload({ auctionId: "a1", cardId: "c1", amount: null, locked: "oui" })).toEqual({ auctionId: "a1", cardId: "c1", amount: null });
  });
});

describe("parseGiftPayload", () => {
  it("ne garde que des formes connues", () => {
    expect(parseGiftPayload({ kind: "BOOSTER" })).toEqual({ kind: "BOOSTER" });
    expect(parseGiftPayload({ kind: "CARD", cardId: "c1", extra: "<b>" })).toEqual({ kind: "CARD", cardId: "c1" });
    expect(parseGiftPayload({ kind: "CARD" })).toBeNull();
    expect(parseGiftPayload("x")).toBeNull();
  });
});

describe("parseCoinFlipPayload", () => {
  it("garde la table, la carte et une raison connue", () => {
    expect(parseCoinFlipPayload({ flipId: "t1", cardId: "c1", reason: "EXPIRED" })).toEqual({ flipId: "t1", cardId: "c1", reason: "EXPIRED" });
    expect(parseCoinFlipPayload({ flipId: "t1", cardId: "c1" })).toEqual({ flipId: "t1", cardId: "c1", reason: null });
    expect(parseCoinFlipPayload({ flipId: "t1", cardId: "c1", reason: "WON" })).toEqual({ flipId: "t1", cardId: "c1", reason: null });
  });

  it("refuse une forme inconnue", () => {
    expect(parseCoinFlipPayload(null)).toBeNull();
    expect(parseCoinFlipPayload({ flipId: "t 1", cardId: "c1" })).toBeNull();
    expect(parseCoinFlipPayload({ flipId: "t1" })).toBeNull();
  });
});

describe("parseTeamGiftPayload", () => {
  it("lit les cadeaux de l'équipe, Encens compris, et refuse une quantité invalide", () => {
    expect(parseTeamGiftPayload({ kind: "INCENSE", quantity: 2 })).toEqual({ kind: "INCENSE", quantity: 2 });
    expect(parseTeamGiftPayload({ kind: "BOOSTER", boosterTypeId: "t1", quantity: 1 })).toEqual({ kind: "BOOSTER", boosterTypeId: "t1", quantity: 1 });
    expect(parseTeamGiftPayload({ kind: "INCENSE", quantity: 0 })).toBeNull();
    expect(parseTeamGiftPayload({ kind: "INCENSE", quantity: "3" })).toBeNull();
    expect(parseTeamGiftPayload({ kind: "OTHER", quantity: 1 })).toBeNull();
  });
});

describe("parseBuyOrderPayload", () => {
  it("garde l'avis, la carte et un prix entier positif", () => {
    expect(parseBuyOrderPayload({ orderId: "o1", cardId: "c1", amount: 1200 })).toEqual({ orderId: "o1", cardId: "c1", amount: 1200 });
  });

  it("refuse une forme inconnue ou un prix invalide", () => {
    expect(parseBuyOrderPayload(null)).toBeNull();
    expect(parseBuyOrderPayload({ orderId: "o1", cardId: "c1" })).toBeNull();
    expect(parseBuyOrderPayload({ orderId: "o1", cardId: "c1", amount: -1 })).toBeNull();
    expect(parseBuyOrderPayload({ orderId: "o1", cardId: "c1", amount: 1.5 })).toBeNull();
    expect(parseBuyOrderPayload({ orderId: "<script>", cardId: "c1", amount: 1 })).toBeNull();
  });
});

describe("parseKyaraImportPayload", () => {
  it("garde les nombres d'un import versé ou un motif de refus connu", () => {
    expect(parseKyaraImportPayload({ kind: "DONE", cards: 12, zeni: 0 })).toEqual({ kind: "DONE", cards: 12, zeni: 0 });
    expect(parseKyaraImportPayload({ kind: "REJECTED", code: "DISCORD_MISMATCH" })).toEqual({ kind: "REJECTED", code: "DISCORD_MISMATCH" });
  });

  it("refuse une forme inconnue, un nombre invalide ou un motif hors liste", () => {
    expect(parseKyaraImportPayload(null)).toBeNull();
    expect(parseKyaraImportPayload({ kind: "DONE", cards: -1, zeni: 0 })).toBeNull();
    expect(parseKyaraImportPayload({ kind: "DONE", cards: 1.5, zeni: 0 })).toBeNull();
    expect(parseKyaraImportPayload({ kind: "REJECTED", code: "<b>libre</b>" })).toBeNull();
  });
});

describe("parseReferralRewardPayload", () => {
  it("garde une étape, une part « confiance », un palier ou un grand-parrainage", () => {
    expect(parseReferralRewardPayload({ kind: "STEP", side: "REFEREE", step: 1, multiplier: 2 })).toEqual({ kind: "STEP", side: "REFEREE", step: 1, milestone: null, multiplier: 2 });
    expect(parseReferralRewardPayload({ kind: "TRUST_BONUS", side: "REFERRER", step: 2 })).toEqual({ kind: "TRUST_BONUS", side: "REFERRER", step: 2, milestone: null, multiplier: 1 });
    expect(parseReferralRewardPayload({ kind: "MILESTONE", milestone: 25 })).toEqual({ kind: "MILESTONE", side: null, step: null, milestone: 25, multiplier: 1 });
    expect(parseReferralRewardPayload({ kind: "GRAND" })).toEqual({ kind: "GRAND", side: null, step: null, milestone: null, multiplier: 1 });
  });

  it("refuse une forme inconnue, une étape hors bornes ou un palier manquant", () => {
    expect(parseReferralRewardPayload(null)).toBeNull();
    expect(parseReferralRewardPayload({ kind: "BONUS" })).toBeNull();
    expect(parseReferralRewardPayload({ kind: "STEP", side: "REFEREE", step: 5 })).toBeNull();
    expect(parseReferralRewardPayload({ kind: "STEP", step: 1 })).toBeNull();
    expect(parseReferralRewardPayload({ kind: "MILESTONE" })).toBeNull();
  });
});
