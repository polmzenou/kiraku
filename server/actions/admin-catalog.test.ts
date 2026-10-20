import { beforeEach, describe, expect, it, vi } from "vitest";
import { blankCard } from "@/lib/catalog/admin-form";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), limit: vi.fn(), save: vi.fn(), status: vi.fn(), rarity: vi.fn(), tag: vi.fn() }));
vi.mock("next/cache", () => ({ updateTag: mocks.tag }));
vi.mock("../admin", () => ({ getAdmin: mocks.admin }));
vi.mock("../db", () => ({ prisma: {} }));
vi.mock("../ratelimit", () => ({ rateLimit: mocks.limit }));
vi.mock("../catalog/queries", () => ({ CATALOG_TAG: "catalog" }));
vi.mock("../catalog/rarities", () => ({ RARITIES_TAG: "catalog-rarities" }));
vi.mock("../settings", () => ({ SETTINGS_TAG: "settings" }));
vi.mock("../boosters/pools", () => ({ BOOSTER_TYPES_TAG: "booster-types" }));
vi.mock("../catalog/admin-core", () => ({
  saveCatalogCardWith: mocks.save, setCatalogCardStatusWith: mocks.status, saveRarityWith: mocks.rarity,
  CatalogMutationError: class extends Error { constructor(readonly code: string) { super(code); } },
}));
import { saveCatalogCard, setCatalogCardStatus, saveCatalogRarity } from "./admin-catalog";
import { CatalogMutationError } from "../catalog/admin-core";
const draft = { ...blankCard("series"), name: "Original" };
beforeEach(() => { vi.clearAllMocks(); mocks.admin.mockResolvedValue({ id: "admin" }); mocks.limit.mockResolvedValue({ success: true }); });
describe("frontière du catalogue administrateur", () => {
  it("refuse toutes les mutations sans rôle administrateur", async () => {
    mocks.admin.mockResolvedValue(null);
    for (const action of [saveCatalogCard, setCatalogCardStatus, saveCatalogRarity]) expect(await action({})).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.status).not.toHaveBeenCalled(); expect(mocks.rarity).not.toHaveBeenCalled();
  });
  it("valide les données et les URL avant l’écriture", async () => {
    expect(await saveCatalogCard({ ...draft, power: -1 })).toMatchObject({ ok: false, error: "INVALID" });
    expect(await saveCatalogCard({ ...draft, imageUrl: "https://evil.com/a.svg" })).toEqual({ ok: false, error: "IMAGE_INVALID" });
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("respecte la limitation de débit", async () => {
    mocks.limit.mockResolvedValue({ success: false });
    expect(await saveCatalogCard(draft)).toEqual({ ok: false, error: "RATE_LIMITED" }); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("signale les conflits sans invalider les caches", async () => {
    mocks.save.mockRejectedValue(new CatalogMutationError("CONFLICT"));
    expect(await saveCatalogCard(draft)).toEqual({ ok: false, error: "CONFLICT" }); expect(mocks.tag).not.toHaveBeenCalled();
  });
  it("publie les nouvelles données aux lecteurs uniquement après succès", async () => {
    mocks.save.mockResolvedValue({ id: "created", updatedAt: "2026-10-20T00:00:00.000Z", seriesId: "series" });
    expect(await saveCatalogCard(draft)).toMatchObject({ ok: true, id: "created" });
    expect(mocks.save).toHaveBeenCalledWith({}, "admin", draft);
    expect(mocks.tag.mock.calls.map(([tag]) => tag)).toEqual(["catalog", "booster-types", "catalog-rarities", "settings"]);
  });
});
