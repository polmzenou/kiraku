import { describe, expect, it } from "vitest";
import { decideSend, pairKey, relationBetween, type FriendshipRow, type SendContext } from "./relation";

const none = { byMe: false, byThem: false };
const pending = (requesterId: string, addresseeId: string, declinedAt: Date | null = null): FriendshipRow => ({
  requesterId,
  addresseeId,
  status: "PENDING",
  declinedAt,
});

describe("pairKey", () => {
  it("donne la même clé dans les deux sens", () => {
    expect(pairKey("b", "a")).toBe(pairKey("a", "b"));
    expect(pairKey("a", "b")).toBe("a:b");
  });
});

describe("relationBetween", () => {
  it("lit amis, demande envoyée et demande reçue", () => {
    expect(relationBetween("a", null, none)).toBe("NONE");
    expect(relationBetween("a", { ...pending("a", "b"), status: "ACCEPTED" }, none)).toBe("FRIENDS");
    expect(relationBetween("a", pending("a", "b"), none)).toBe("OUTGOING");
    expect(relationBetween("b", pending("a", "b"), none)).toBe("INCOMING");
  });

  it("ne révèle ni un refus ni un blocage de l'autre côté", () => {
    const declined = pending("a", "b", new Date());
    expect(relationBetween("a", declined, none)).toBe("OUTGOING");
    expect(relationBetween("b", declined, none)).toBe("NONE");
    expect(relationBetween("a", pending("a", "b"), { byMe: false, byThem: true })).toBe("NONE");
  });

  it("montre mon propre blocage", () => {
    expect(relationBetween("a", null, { byMe: true, byThem: false })).toBe("BLOCKED_BY_ME");
  });
});

describe("decideSend", () => {
  const base: SendContext = {
    senderId: "a",
    row: null,
    blocks: none,
    targetEligible: true,
    cooldownActive: false,
    senderFriends: 0,
    senderOutgoing: 0,
    targetFriends: 0,
    limits: { maxFriends: 10, maxOutgoing: 3 },
  };

  it("crée une demande quand rien n'existe", () => {
    expect(decideSend(base, "b")).toBe("CREATE");
  });

  it("accepte quand l'autre avait déjà demandé, même si je l'avais refusée", () => {
    expect(decideSend({ ...base, row: pending("b", "a") }, "b")).toBe("ACCEPT");
    expect(decideSend({ ...base, row: pending("b", "a", new Date()) }, "b")).toBe("ACCEPT");
  });

  it("répond comme une demande normale quand la cible ne doit rien recevoir", () => {
    expect(decideSend({ ...base, blocks: { byMe: false, byThem: true } }, "b")).toBe("SILENT");
    expect(decideSend({ ...base, targetEligible: false }, "b")).toBe("SILENT");
    expect(decideSend({ ...base, cooldownActive: true }, "b")).toBe("SILENT");
    expect(decideSend({ ...base, targetFriends: 10 }, "b")).toBe("SILENT");
  });

  it("refuse ce que l'expéditeur sait déjà ou qui ne concerne que lui", () => {
    expect(decideSend(base, "a")).toBe("SELF");
    expect(decideSend({ ...base, row: pending("a", "b") }, "b")).toBe("ALREADY");
    expect(decideSend({ ...base, row: { ...pending("b", "a"), status: "ACCEPTED" } }, "b")).toBe("ALREADY");
    expect(decideSend({ ...base, blocks: { byMe: true, byThem: false } }, "b")).toBe("BLOCKED_BY_ME");
    expect(decideSend({ ...base, senderFriends: 10 }, "b")).toBe("LIMIT_FRIENDS");
    expect(decideSend({ ...base, senderOutgoing: 3 }, "b")).toBe("LIMIT_OUTGOING");
  });

  it("compte la limite de demandes sortantes avant le silence (pas de fuite par la limite)", () => {
    expect(decideSend({ ...base, senderOutgoing: 3, blocks: { byMe: false, byThem: true } }, "b")).toBe("LIMIT_OUTGOING");
  });
});
