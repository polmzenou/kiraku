import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ blocks: vi.fn(), listings: vi.fn(), groupBy: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({
  prisma: { userBlock: { findMany: db.blocks }, tradeListing: { findMany: db.listings }, userCard: { groupBy: db.groupBy, findMany: vi.fn(async () => []) } },
}));
vi.mock("../boosters/display", () => ({ cardViews: async (ids: string[]) => new Map(ids.map((id) => [id, { cardId: id }])) }));
vi.mock("../profile/decor", () => ({ playerRefSelect: { id: true }, toPlayerRef: vi.fn() }));
vi.mock("../collection/masked-players", () => ({ maskablePlayerSelect: { id: true }, maskedPlayerRefs: async () => new Map() }));
vi.mock("../collection/owned", () => ({ ownedCardIds: async () => [] }));
vi.mock("../prestige/copy-marks", () => ({ copyMarksOf: async () => new Map(), withCopy: (view: unknown) => view }));
import { LISTINGS_PAGE_SIZE, listListings } from "./listings";

const now = new Date("2026-10-30T12:00:00Z");
const input = { viewerId: "viewer", q: "", filter: "all" as const, cursor: null, locale: "fr", now };

/** Annonce de `ownerId` pour la carte `cardId`, sans offre. */
const row = (id: string, ownerId: string, cardId: string) => ({
  id,
  createdAt: now,
  expiresAt: new Date(now.getTime() + 3_600_000),
  cardId,
  userCardId: null,
  note: null,
  owner: { id: ownerId },
  wants: [],
  offers: [],
  _count: { offers: 0 },
});

beforeEach(() => {
  db.blocks.mockReset().mockResolvedValue([{ blockerId: "hidden-owner", blockedId: "viewer" }]);
  db.listings.mockReset().mockResolvedValue([]);
  db.groupBy.mockReset().mockResolvedValue([]);
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

describe("annonces sans exemplaire libre", () => {
  it("une page entière d'annonces mortes n'est pas renvoyée vide : la suivante est lue", async () => {
    // Première page : l'auteur « gone » n'a plus la carte ; seconde : « alive » l'a encore
    const dead = Array.from({ length: LISTINGS_PAGE_SIZE + 1 }, (_, i) => row(`d${i}`, "gone", "c1"));
    db.listings.mockResolvedValueOnce(dead).mockResolvedValueOnce([row("a1", "alive", "c2")]);
    db.groupBy.mockResolvedValue([{ ownerId: "alive", cardId: "c2" }]);
    const page = await listListings(input);
    expect(page.items.map((l) => l.id)).toEqual(["a1"]);
    expect(page.nextCursor).toBeNull();
    // La seconde lecture repart après la dernière annonce de la première page
    expect(db.listings.mock.calls[1][0]).toMatchObject({ cursor: { id: `d${LISTINGS_PAGE_SIZE - 1}` }, skip: 1 });
  });

  it("ne lit que l'offre du lecteur et compte les offres en attente sans les charger", async () => {
    await listListings(input);
    const select = db.listings.mock.calls[0][0].select;
    expect(select.offers).toMatchObject({ where: { status: "PENDING", bidderId: "viewer" }, take: 1 });
    expect(select._count).toEqual({ select: { offers: { where: { status: "PENDING" } } } });
  });
});
