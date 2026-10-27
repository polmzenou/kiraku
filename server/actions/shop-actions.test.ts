import { beforeEach, describe, expect, it, vi } from "vitest";

// Règle de la boutique là où elle s'applique : l'achat refuse un article bloqué sans débit, l'admin
// refuse de mettre en vente un sachet scellé ou du Mythique mais laisse toujours désactiver.

const m = vi.hoisted(() => {
  class ShopError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  }
  return {
    ShopError,
    refresh: vi.fn(),
    loadShopItemIssue: vi.fn(),
    lotContentIssue: vi.fn(),
    itemsContentIssue: vi.fn(),
    buyWithZeniWith: vi.fn(),
    writeAdminLog: vi.fn(),
    tx: { shopItem: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() } },
    lotFindUnique: vi.fn(),
  };
});

vi.mock("next/cache", () => ({ refresh: m.refresh }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "fr" }));
vi.mock("../db", () => ({
  prisma: { lot: { findUnique: m.lotFindUnique }, $transaction: (fn: (tx: unknown) => unknown) => fn(m.tx) },
}));
vi.mock("../user", () => ({
  getCurrentUser: async () => ({ id: "player", bannedAt: null, deletionRequestedAt: null, anonymizedAt: null }),
  requireActiveUser: vi.fn(),
}));
vi.mock("../admin", () => ({ getAdmin: async () => ({ id: "admin" }) }));
vi.mock("../admin/log", () => ({ writeAdminLog: m.writeAdminLog }));
vi.mock("../ratelimit", () => ({ rateLimit: async () => ({ success: true }) }));
vi.mock("../settings", () => ({ getSetting: async (key: string) => (key === "shop.enabled" ? true : "Europe/Paris") }));
vi.mock("../economy/shop-guard", () => ({
  loadShopItemIssue: m.loadShopItemIssue,
  lotContentIssue: m.lotContentIssue,
  itemsContentIssue: m.itemsContentIssue,
}));
vi.mock("../economy/shop-core", () => ({ buyWithZeniWith: m.buyWithZeniWith, ShopError: m.ShopError }));
vi.mock("../economy/deps", () => ({ lotDeps: () => ({}) }));
vi.mock("../boosters/display", () => ({ cardViews: async () => new Map() }));
vi.mock("../economy/lots", () => ({ LotError: class extends Error {} }));
vi.mock("../economy/missions-core", () => ({ claimMissionWith: vi.fn(), MissionError: class extends Error {} }));
vi.mock("../economy/queries", () => ({ listLedger: vi.fn() }));
vi.mock("../economy/referral", () => ({ attachReferral: vi.fn(), qualifyLater: vi.fn() }));
vi.mock("../economy/referral-core", () => ({ claimReferralWith: vi.fn(), ReferralError: class extends Error {} }));

const { buyShopItemAction } = await import("./economy");
const { saveShopItemAction } = await import("./admin-economy");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("achat en boutique", () => {
  it("refuse sans débit un article que la règle bloque, et rafraîchit la page", async () => {
    m.loadShopItemIssue.mockResolvedValue("MYTHIC");
    expect(await buyShopItemAction({ shopItemId: "item", expectedPrice: 900 })).toEqual({ ok: false, error: "NOT_FOR_SALE" });
    expect(m.buyWithZeniWith).not.toHaveBeenCalled();
    expect(m.refresh).toHaveBeenCalledOnce();
  });

  it("achète un article en règle", async () => {
    m.loadShopItemIssue.mockResolvedValue(null);
    m.buyWithZeniWith.mockResolvedValue({ purchaseId: "p", coins: 4100, grant: { zeni: 0, boosters: [{ boosterTypeId: "t", count: 5 }], cards: [], coins: 4100 } });
    expect(await buyShopItemAction({ shopItemId: "item", expectedPrice: 900 })).toEqual({
      ok: true,
      coins: 4100,
      reward: { zeni: 0, boosters: 5, cards: [] },
    });
    expect(m.buyWithZeniWith).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: "player", shopItemId: "item", expectedPrice: 900 }),
      expect.anything(),
    );
  });

  it("renvoie l'erreur du cœur avec la page à jour (prix changé)", async () => {
    m.loadShopItemIssue.mockResolvedValue(null);
    m.buyWithZeniWith.mockRejectedValue(new m.ShopError("STALE"));
    expect(await buyShopItemAction({ shopItemId: "item", expectedPrice: 900 })).toEqual({ ok: false, error: "STALE" });
    expect(m.refresh).toHaveBeenCalledOnce();
  });
});

describe("admin de la boutique", () => {
  const item = {
    slug: "pack-5-divin",
    name: { fr: "Pack", en: "" },
    description: { fr: "", en: "" },
    lotId: "lot",
    priceZeni: 900,
    priceCents: null,
    stripePriceId: null,
    perUserLimit: null,
    limitPeriod: null,
    startsAt: null,
    endsAt: null,
    active: true,
    sortOrder: 0,
  };

  beforeEach(() => {
    m.lotFindUnique.mockResolvedValue({ id: "lot" });
    m.tx.shopItem.findUnique.mockResolvedValue(null);
    m.tx.shopItem.create.mockResolvedValue({ id: "new-item" });
  });

  it("refuse de mettre en vente un sachet scellé ou du Mythique", async () => {
    m.lotContentIssue.mockResolvedValue("SEALED");
    expect(await saveShopItemAction(item)).toEqual({ ok: false, error: "SHOP_SEALED" });
    m.lotContentIssue.mockResolvedValue("MYTHIC");
    expect(await saveShopItemAction(item)).toEqual({ ok: false, error: "SHOP_MYTHIC" });
    expect(m.tx.shopItem.create).not.toHaveBeenCalled();
  });

  it("laisse toujours désactiver un article fautif", async () => {
    m.lotContentIssue.mockResolvedValue("SEALED");
    expect(await saveShopItemAction({ ...item, active: false })).toEqual({ ok: true, id: "new-item" });
    expect(m.lotContentIssue).not.toHaveBeenCalled();
  });
});
