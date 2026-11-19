import { describe, expect, it } from "vitest";
import { exchangeTotals, sortExchanges, type Exchange } from "./exchanges";
import { scorePairs, type TransferKind } from "./score";

const card = { id: "c1", name: "Kaito", rarity: "RARE", publicId: 1 };
const at = (day: number) => new Date(Date.UTC(2026, 10, day));

const rows: Exchange[] = [
  { kind: "gift", id: "g1", at: at(1), fromId: "a", toId: "b", giftKind: "CARD", card, zeni: 0 },
  { kind: "gift", id: "g2", at: at(2), fromId: "b", toId: "a", giftKind: "BOOSTER", card: null, zeni: 300 },
  { kind: "auction", id: "x1", at: at(3), fromId: "a", toId: "b", card, zeni: 1200 },
  { kind: "buyOrder", id: "o1", at: at(4), fromId: "b", toId: "a", card, zeni: 500 },
  { kind: "flip", id: "f1", at: at(5), fromId: "a", toId: "b", card, kept: card },
  { kind: "trade", id: "t1", at: at(6), fromId: "b", toId: "a", given: card, received: null },
  { kind: "listing", id: "l1", at: at(7), fromId: "a", toId: "b", given: card, received: card },
  // Une autre paire : ignorée
  { kind: "gift", id: "g3", at: at(8), fromId: "a", toId: "z", giftKind: "CARD", card, zeni: 0 },
];

describe("échanges entre deux comptes", () => {
  it("trie du plus récent au plus ancien, ordre stable à date égale", () => {
    const sorted = sortExchanges([...rows, { ...rows[0], id: "g0" }]);
    expect(sorted.map((r) => r.id)).toEqual(["g3", "l1", "t1", "f1", "o1", "x1", "g2", "g0", "g1"]);
  });

  it("totalise par type et par sens, sans compter les autres paires", () => {
    const totals = exchangeTotals(rows, "a", "b");
    expect(totals).toEqual({
      total: 7,
      byKind: { gift: 2, auction: 1, buyOrder: 1, flip: 1, trade: 1, listing: 1 },
      ab: 3, // cadeau, enchère, pile ou face
      ba: 2, // booster offert, avis de recherche rempli
      swaps: 2,
      zeniAb: 1200,
      zeniBa: 500,
    });
    // L'ordre de la paire ne change que le sens
    expect(exchangeTotals(rows, "b", "a")).toMatchObject({ total: 7, ab: 2, ba: 3, zeniAb: 500, zeniBa: 1200 });
  });

  it("le total retombe sur le chiffre de la puce « échanges entre eux »", () => {
    const kindOf: Record<Exchange["kind"], TransferKind> = { gift: "gift", auction: "sale", buyOrder: "sale", flip: "flip", trade: "swap", listing: "swap" };
    const pair = rows.filter((r) => r.toId !== "z");
    const pairs = scorePairs({
      users: [
        { id: "a", username: "Aoi", email: null, createdAt: at(1) },
        { id: "b", username: "Botan", email: null, createdAt: at(20) },
      ],
      signals: [],
      referrals: [],
      onlyFriends: [],
      transfers: pair.map((r) => ({ fromId: r.fromId, toId: r.toId, kind: kindOf[r.kind], count: 1 })),
      sharedCap: 5,
      minScore: 50,
    });
    const interactions = pairs[0].reasons.find((r) => r.kind === "interactions");
    expect(interactions).toEqual({ kind: "interactions", total: exchangeTotals(rows, "a", "b").total });
  });
});
