import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ blocks: vi.fn(), listings: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({ prisma: { userBlock: { findMany: db.blocks }, tradeListing: { findMany: db.listings } } }));
vi.mock("../boosters/display", () => ({ cardViews: async () => new Map() }));
vi.mock("../profile/decor", () => ({ playerRefSelect: { id: true }, toPlayerRef: vi.fn() }));
import { listListings } from "./listings";

const now = new Date("2026-10-30T12:00:00Z");
const input = { viewerId: "viewer", q: "", filter: "all" as const, cursor: null, locale: "fr", now };

beforeEach(() => {
  db.blocks.mockReset().mockResolvedValue([{ blockerId: "hidden-owner", blockedId: "viewer" }]);
  db.listings.mockReset().mockResolvedValue([]);
});

describe("lien direct vers une annonce d'échange", () => {
  it("cible l'identifiant sans supprimer les restrictions de blocage, de bannissement ou d'expiration", async () => {
    expect(await listListings({ ...input, listingId: "older-listing" })).toEqual({ items: [], nextCursor: null });
    expect(db.listings.mock.calls[0][0].where).toMatchObject({
      id: "older-listing", status: "OPEN", expiresAt: { gt: now },
      owner: { bannedAt: null }, ownerId: { notIn: ["hidden-owner"] },
    });
  });
  it("conserve le tableau général quand aucun identifiant n'est demandé", async () => {
    await listListings(input);
    expect(db.listings.mock.calls[0][0].where).not.toHaveProperty("id");
    expect(db.listings.mock.calls[0][0].take).toBeGreaterThan(1);
  });
});
