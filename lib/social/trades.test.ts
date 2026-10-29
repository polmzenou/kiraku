import { describe, expect, it } from "vitest";
import { checkProposal, isTradeOpen, tradeExpiresAt, uniqueOffered, type ProposalCheck } from "./trades";

const rules = {
  expiryHours: 48,
  maxOffered: 3,
  maxPendingSent: 2,
  perDay: 5,
  allowedRarities: ["COMMON", "RARE", "MYTHIC"] as const,
  nonFriends: true,
};

const base: ProposalCheck = {
  wanted: { cardId: "gojo", rarity: "MYTHIC" },
  offered: [
    { cardId: "a", rarity: "COMMON" },
    { cardId: "b", rarity: "RARE" },
  ],
  friends: true,
  blocked: false,
  collectionVisible: true,
  pendingSent: 0,
  sentLastDay: 0,
  duplicate: false,
  rules: { ...rules, allowedRarities: [...rules.allowedRarities] },
};

describe("proposition d'échange", () => {
  it("accepte une proposition entre amis dans les limites", () => {
    expect(checkProposal(base)).toBeNull();
  });

  it("accepte un non-ami dont la collection est visible", () => {
    expect(checkProposal({ ...base, friends: false })).toBeNull();
  });

  it("garde l'échange entre amis même si leur collection est cachée", () => {
    expect(checkProposal({ ...base, collectionVisible: false })).toBeNull();
  });

  it("refuse un non-ami quand le réglage ferme les échanges hors amis", () => {
    expect(checkProposal({ ...base, friends: false, rules: { ...base.rules, nonFriends: false } })).toBe("NOT_FRIENDS");
  });

  it("refuse un non-ami dont la collection est cachée", () => {
    expect(checkProposal({ ...base, friends: false, collectionVisible: false })).toBe("PRIVATE");
  });

  it("fait passer le blocage avant tout le reste", () => {
    expect(checkProposal({ ...base, friends: false, collectionVisible: false, blocked: true })).toBe("BLOCKED");
  });

  it.each([
    [{ blocked: true }, "BLOCKED"],
    [{ offered: [] }, "NO_OFFER"],
    [{ offered: ["a", "b", "c", "d"].map((cardId) => ({ cardId, rarity: "COMMON" as const })) }, "TOO_MANY_OFFERED"],
    [{ offered: [{ cardId: "gojo", rarity: "MYTHIC" as const }] }, "SAME_CARD"],
    [{ offered: [{ cardId: "x", rarity: "EPIC" as const }] }, "RARITY"],
    [{ wanted: { cardId: "w", rarity: "LEGENDARY" as const } }, "RARITY"],
    [{ duplicate: true }, "DUPLICATE"],
    [{ pendingSent: 2 }, "PENDING_LIMIT"],
    [{ sentLastDay: 5 }, "DAILY_LIMIT"],
  ])("refuse %o", (patch, code) => {
    expect(checkProposal({ ...base, ...patch } as ProposalCheck)).toBe(code);
  });

  it("dédoublonne les cartes offertes", () => {
    expect(uniqueOffered(["a", "b", "a"])).toEqual(["a", "b"]);
  });
});

describe("échéance", () => {
  const now = new Date("2026-10-19T12:00:00Z");

  it("expire après le délai réglé", () => {
    expect(tradeExpiresAt(now, 48).toISOString()).toBe("2026-10-21T12:00:00.000Z");
  });

  it("n'est ouverte qu'en attente et avant l'échéance", () => {
    expect(isTradeOpen({ status: "PENDING", expiresAt: new Date(now.getTime() + 1) }, now)).toBe(true);
    expect(isTradeOpen({ status: "PENDING", expiresAt: now }, now)).toBe(false);
    expect(isTradeOpen({ status: "ACCEPTED", expiresAt: new Date(now.getTime() + 1) }, now)).toBe(false);
  });
});
