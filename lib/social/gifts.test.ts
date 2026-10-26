import { describe, expect, it } from "vitest";
import { checkGift, checkSealedGift, pickGiftCopy, type GiftCheck } from "./gifts";

const now = new Date("2026-10-14T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
const player = { isGuest: false, bannedAt: null, createdAt: daysAgo(30) };

const ok: GiftCheck = {
  sender: player,
  recipient: player,
  friendsSince: daysAgo(3),
  blocked: false,
  sentToday: 0,
  receivedToday: 0,
  now,
  rules: { enabled: true, perDaySent: 3, perDayReceived: 5, minAccountAgeHours: 48, minFriendshipHours: 24 },
};

describe("checkGift", () => {
  it("permet un cadeau entre amis établis", () => {
    expect(checkGift(ok)).toBeNull();
  });

  it("bloque les invités, les bannis et l'interrupteur coupé", () => {
    expect(checkGift({ ...ok, rules: { ...ok.rules, enabled: false } })).toBe("DISABLED");
    expect(checkGift({ ...ok, sender: { ...player, isGuest: true } })).toBe("GUEST");
    expect(checkGift({ ...ok, sender: { ...player, bannedAt: now } })).toBe("BANNED");
  });

  it("traite un destinataire non ami, bloqué, invité ou banni de la même façon", () => {
    expect(checkGift({ ...ok, friendsSince: null })).toBe("NOT_FRIENDS");
    expect(checkGift({ ...ok, blocked: true })).toBe("NOT_FRIENDS");
    expect(checkGift({ ...ok, recipient: { ...player, isGuest: true } })).toBe("NOT_FRIENDS");
    expect(checkGift({ ...ok, recipient: { ...player, bannedAt: now } })).toBe("NOT_FRIENDS");
  });

  it("exige un compte et une amitié assez anciens (anti multicomptes)", () => {
    expect(checkGift({ ...ok, sender: { ...player, createdAt: daysAgo(1) } })).toBe("ACCOUNT_TOO_NEW");
    expect(checkGift({ ...ok, friendsSince: new Date(now.getTime() - 3_600_000) })).toBe("FRIENDSHIP_TOO_NEW");
    expect(checkGift({ ...ok, sender: { ...player, createdAt: daysAgo(2) } })).toBeNull();
  });

  it("applique les quotas du jour envoyés et reçus", () => {
    expect(checkGift({ ...ok, sentToday: 2 })).toBeNull();
    expect(checkGift({ ...ok, sentToday: 3 })).toBe("SENT_LIMIT");
    expect(checkGift({ ...ok, receivedToday: 5 })).toBe("RECEIVED_LIMIT");
  });
});

describe("pickGiftCopy", () => {
  const copies = [
    { id: "old", obtainedAt: daysAgo(10) },
    { id: "new", obtainedAt: daysAgo(1) },
    { id: "mid", obtainedAt: daysAgo(5) },
  ];

  it("prend le plus récent hors vitrine", () => {
    expect(pickGiftCopy(copies, new Set())?.id).toBe("new");
    expect(pickGiftCopy(copies, new Set(["new"]))?.id).toBe("mid");
  });

  it("prend l'exemplaire exposé s'il n'y a que lui", () => {
    expect(pickGiftCopy([copies[0]], new Set(["old"]))?.id).toBe("old");
    expect(pickGiftCopy([], new Set())).toBeNull();
  });
});

describe("checkSealedGift", () => {
  const sealedOk = {
    giftable: true,
    hasDiscord: true,
    senderCreatedAt: daysAgo(30),
    sentThisWeek: 0,
    now,
    rules: { requiresDiscord: true, minAccountDays: 7, perWeek: 1 },
  };

  it("permet d'offrir un sachet tombé d'un tirage depuis un compte lié et ancien", () => {
    expect(checkSealedGift(sealedOk)).toBeNull();
  });

  it("un sachet reçu ou déjà offert ne se ré-offre pas", () => {
    expect(checkSealedGift({ ...sealedOk, giftable: false })).toBe("NOT_GIFTABLE");
  });

  it("garde-fous contre le farm : Discord, ancienneté, limite de la semaine", () => {
    expect(checkSealedGift({ ...sealedOk, hasDiscord: false })).toBe("NEEDS_DISCORD");
    expect(checkSealedGift({ ...sealedOk, hasDiscord: false, rules: { ...sealedOk.rules, requiresDiscord: false } })).toBeNull();
    expect(checkSealedGift({ ...sealedOk, senderCreatedAt: daysAgo(6) })).toBe("SEALED_ACCOUNT_TOO_NEW");
    expect(checkSealedGift({ ...sealedOk, senderCreatedAt: daysAgo(7) })).toBeNull();
    expect(checkSealedGift({ ...sealedOk, sentThisWeek: 1 })).toBe("SEALED_WEEK_LIMIT");
    expect(checkSealedGift({ ...sealedOk, rules: { ...sealedOk.rules, perWeek: 0 } })).toBe("SEALED_WEEK_LIMIT");
  });
});
