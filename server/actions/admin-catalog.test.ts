import { beforeEach, describe, expect, it, vi } from "vitest";
import { blankCard } from "@/lib/catalog/admin-form";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), limit: vi.fn(), save: vi.fn(), status: vi.fn(), rarity: vi.fn(), bulk: vi.fn(), remove: vi.fn(), tag: vi.fn() }));
vi.mock("next/cache", () => ({ updateTag: mocks.tag }));
vi.mock("../admin", () => ({ getStaff: mocks.admin }));
vi.mock("../db", () => ({ prisma: {} }));
vi.mock("../ratelimit", () => ({ rateLimit: mocks.limit }));
vi.mock("../catalog/queries", () => ({ CATALOG_TAG: "catalog" }));
vi.mock("../catalog/rarities", () => ({ RARITIES_TAG: "catalog-rarities" }));
vi.mock("../settings", () => ({ SETTINGS_TAG: "settings", forgetSettings: () => {} }));
vi.mock("../boosters/pools", () => ({ BOOSTER_TYPES_TAG: "booster-types" }));
vi.mock("../catalog/admin-core", () => ({
  saveCatalogCardWith: mocks.save, setCatalogCardStatusWith: mocks.status, saveRarityWith: mocks.rarity, bulkCatalogWith: mocks.bulk, deleteCatalogCardWith: mocks.remove,
  CatalogMutationError: class extends Error { constructor(readonly code: string) { super(code); } },
}));
import { bulkCatalogAction, deleteCatalogCard, saveCatalogCard, setCatalogCardStatus, saveCatalogRarity } from "./admin-catalog";
import { CatalogMutationError } from "../catalog/admin-core";
const draft = { ...blankCard("series"), name: "Original" };
beforeEach(() => { vi.clearAllMocks(); mocks.admin.mockResolvedValue({ user: { id: "admin" }, scope: "full" }); mocks.limit.mockResolvedValue({ success: true }); });
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
    expect(mocks.save).toHaveBeenCalledWith({}, "admin", draft, "full");
    expect(mocks.tag.mock.calls.map(([tag]) => tag)).toEqual(["catalog", "booster-types", "catalog-rarities", "settings"]);
  });
});
describe("rôle DEV : brouillons seulement", () => {
  const card = { id: "card", updatedAt: "2026-10-20T00:00:00.000Z" };
  beforeEach(() => { mocks.admin.mockResolvedValue({ user: { id: "dev" }, scope: "drafts" }); });
  it("refuse publication, archivage, actions groupées et raretés sans toucher la base", async () => {
    expect(await setCatalogCardStatus({ ...card, status: "ARCHIVED" })).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(await bulkCatalogAction({ ids: ["card"], action: "publish" })).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(await saveCatalogRarity({})).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(mocks.status).not.toHaveBeenCalled(); expect(mocks.bulk).not.toHaveBeenCalled(); expect(mocks.rarity).not.toHaveBeenCalled();
  });
  it("transmet le périmètre au cœur, qui revérifie sous verrou", async () => {
    mocks.save.mockResolvedValue({ id: "created", updatedAt: card.updatedAt, seriesId: "series" });
    mocks.remove.mockResolvedValue(card);
    expect(await saveCatalogCard(draft)).toMatchObject({ ok: true });
    expect(mocks.save).toHaveBeenCalledWith({}, "dev", draft, "drafts");
    expect(await deleteCatalogCard(card)).toMatchObject({ ok: true });
    expect(mocks.remove).toHaveBeenCalledWith({}, "dev", "card", card.updatedAt, "drafts");
  });
  it("relaie le refus du cœur pour une carte publiée", async () => {
    mocks.save.mockRejectedValue(new CatalogMutationError("FORBIDDEN"));
    expect(await saveCatalogCard({ ...draft, status: "PUBLISHED", imageUrl: "" })).toMatchObject({ ok: false });
  });
});
