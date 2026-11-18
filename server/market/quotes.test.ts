import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auctions: vi.fn(),
  cards: vi.fn(),
  raw: vi.fn(),
  summaries: vi.fn(),
  settings: { "market.quoteWindowDays": 30, "market.quoteMinSales": 2, "market.quoteHistoryDays": 90, "game.timeZone": "Europe/Paris" } as Record<string, unknown>,
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("../db", () => ({ prisma: { auction: { findMany: mocks.auctions }, card: { findMany: mocks.cards }, $queryRaw: mocks.raw } }));
vi.mock("../settings", () => ({ getSetting: (key: string) => Promise.resolve(mocks.settings[key]) }));
vi.mock("../catalog/queries", () => ({ getCatalogSummaries: mocks.summaries }));

import { getCardPriceHistory, getCollectionValue, getMarketQuotes, getTopMovers } from "./quotes";

const DAY = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * DAY);
const sold = (cardId: string, price: number, d: number, rarity = "EPIC") => ({ cardId, finalPrice: price, settledAt: ago(d), card: { rarity } });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auctions.mockResolvedValue([]);
  mocks.cards.mockResolvedValue([]);
  mocks.raw.mockResolvedValue([]);
  mocks.summaries.mockResolvedValue([]);
});

describe("cotes lues en base", () => {
  it("ne lit que les ventes conclues des deux dernières fenêtres", async () => {
    mocks.auctions.mockResolvedValue([sold("a", 100, 1), sold("a", 140, 2), sold("a", 50, 40), sold("a", 70, 41)]);
    const quotes = await getMarketQuotes();
    expect(quotes.byCard.a).toEqual({ price: 120, sales: 2, previous: 60, changeBp: 10_000 });
    const { where } = mocks.auctions.mock.calls[0][0];
    expect(where.status).toBe("SOLD");
    expect(where.finalPrice).toEqual({ not: null });
    expect(Date.now() - where.settledAt.gt.getTime()).toBeGreaterThanOrEqual(60 * DAY - 1_000);
    expect(Date.now() - where.settledAt.gt.getTime()).toBeLessThan(60 * DAY + 60_000);
  });

  it("lit l'historique d'une carte sur la période de la courbe plus une fenêtre de cote", async () => {
    mocks.auctions.mockResolvedValue([{ finalPrice: 100, settledAt: ago(1) }, { finalPrice: 140, settledAt: ago(2) }]);
    const history = await getCardPriceHistory("card-1");
    expect(history.quote.price).toBe(120);
    expect(history.series.sales).toHaveLength(2);
    const { where } = mocks.auctions.mock.calls[0][0];
    expect(where).toMatchObject({ cardId: "card-1", status: "SOLD" });
    expect(Date.now() - where.settledAt.gt.getTime()).toBeGreaterThanOrEqual(120 * DAY - 1_000);
    expect(Date.now() - where.settledAt.gt.getTime()).toBeLessThan(120 * DAY + 60_000);
  });

  it("estime la collection avec la cote de la carte, sinon celle de sa rareté", async () => {
    mocks.auctions.mockResolvedValue([sold("a", 100, 1), sold("a", 100, 2), sold("b", 300, 3)]);
    mocks.raw.mockResolvedValue([{ cardId: "a", rarity: "EPIC", copies: 2 }, { cardId: "z", rarity: "EPIC", copies: 1 }, { cardId: "m", rarity: "MYTHIC", copies: 1 }]);
    expect(await getCollectionValue("user-1")).toEqual({ total: 300, fromCard: 200, fromRarity: 100, unpriced: 1 });
  });

  it("classe les hausses et saute les cartes sans fiche publique", async () => {
    mocks.auctions.mockResolvedValue([
      sold("up", 200, 1), sold("up", 200, 2), sold("up", 100, 40), sold("up", 100, 41),
      sold("gone", 900, 1), sold("gone", 900, 2), sold("gone", 100, 40), sold("gone", 100, 41),
    ]);
    mocks.cards.mockResolvedValue([{ id: "up", publicId: 7 }]);
    mocks.summaries.mockResolvedValue([{ anilistId: 7, name: "Makima" }]);
    const movers = await getTopMovers(6);
    expect(movers).toEqual([{ card: { anilistId: 7, name: "Makima" }, price: 200, changeBp: 10_000, sales: 2 }]);
    expect(mocks.cards).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["gone", "up"] }, status: "PUBLISHED" } }));
  });

  it("ne lit aucune carte quand rien ne monte", async () => {
    expect(await getTopMovers()).toEqual([]);
    expect(mocks.cards).not.toHaveBeenCalled();
  });
});
