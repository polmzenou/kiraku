import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ blocks: vi.fn(), listings: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({ prisma: { userBlock: { findMany: db.blocks }, tradeListing: { findMany: db.listings } } }));
vi.mock("../boosters/display", () => ({ cardViews: async () => new Map() }));
vi.mock("../profile/decor", () => ({ playerRefSelect: { id: true }, toPlayerRef: vi.fn() }));
import { listListings } from "./listings";
import { possessionCardWhere } from "./possession";

const now = new Date("2026-11-27T12:00:00Z");
const input = { viewerId: "viewer", q: "", filter: "all" as const, cursor: null, locale: "fr", now };

beforeEach(() => {
  db.blocks.mockReset().mockResolvedValue([]);
  db.listings.mockReset().mockResolvedValue([]);
});

describe("filtre acquises / non acquises", () => {
  it("traduit le filtre en condition sur les exemplaires du joueur", () => {
    expect(possessionCardWhere("all", "viewer")).toBeNull();
    expect(possessionCardWhere("owned", null)).toBeNull();
    expect(possessionCardWhere("owned", "viewer")).toEqual({ copies: { some: { ownerId: "viewer" } } });
    expect(possessionCardWhere("missing", "viewer")).toEqual({ copies: { none: { ownerId: "viewer" } } });
  });

  it("se combine avec les autres filtres d'échange et retire ses propres annonces", async () => {
    await listListings({ ...input, filter: "mine", possession: "owned" });
    const where = db.listings.mock.calls[0][0].where;
    expect(where.ownerId).toEqual({ notIn: ["viewer"] });
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { card: { copies: { some: { ownerId: "viewer" } } } },
        { offers: { some: { bidderId: "viewer", status: "PENDING" } } },
      ]),
    );
  });

  it("sans filtre, garde ses propres annonces et n'ajoute aucune condition", async () => {
    await listListings(input);
    const where = db.listings.mock.calls[0][0].where;
    expect(where).not.toHaveProperty("ownerId");
    expect(where).not.toHaveProperty("AND");
  });
});
