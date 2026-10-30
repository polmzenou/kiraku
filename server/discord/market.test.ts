import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ enabled: true }));
const db = vi.hoisted(() => ({
  post: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  auction: { findUnique: vi.fn() },
  listing: { findUnique: vi.fn() },
  userCard: { count: vi.fn() },
}));
const publish = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({ prisma: { discordPost: db.post, auction: db.auction, tradeListing: db.listing, userCard: db.userCard } }));
vi.mock("../env", () => ({ appUrl: () => "https://kiraku.example", discordMarketConfigured: true, env: { DISCORD_MARKET_CHANNEL_ID: "1565793902324219925" } }));
vi.mock("../settings", () => ({ getSetting: async () => state.enabled }));
vi.mock("./posts", () => ({ publishDiscordPost: publish }));
import { syncDiscordAuction, syncDiscordListing, syncDiscordMarket } from "./market";

const record = () => ({ key: "auction:a1", auctionId: "a1", messageId: null, attempts: 0, nextAttemptAt: new Date(Date.now() - 1000) });
const auction = () => ({
  id: "a1", status: "ACTIVE", startPrice: 1000, buyoutPrice: 2000, currentBid: null, finalPrice: null, endsAt: new Date(Date.now() + 3_600_000),
  seller: { id: "seller", username: "Sakura", profileVisibility: "PUBLIC", bannedAt: null, anonymizedAt: null },
  card: { name: "Luffy", imageUrl: "https://images.example/card.png", rarityDefinition: { nameFr: "Gold" }, series: { titleRomaji: "One Piece" } },
});
beforeEach(() => {
  state.enabled = true;
  vi.clearAllMocks();
  db.post.findUnique.mockResolvedValue(record());
  db.post.updateMany.mockResolvedValue({ count: 1 });
  db.auction.findUnique.mockResolvedValue(auction());
  db.userCard.count.mockResolvedValue(1);
  publish.mockResolvedValue({ ok: true, messageId: "123456789012345678" });
});

const listing = () => ({
  id: "l1", ownerId: "seller", cardId: "c1", status: "OPEN", expiresAt: new Date(Date.now() + 3_600_000),
  owner: auction().seller,
  card: { name: "Luffy", imageUrl: "https://images.example/card.png", rarityDefinition: { nameFr: "Gold" } },
  wants: [{ card: { name: "Naruto", rarityDefinition: { nameFr: "AR" } } }],
});
const listingPost = () => ({ ...record(), key: "listing:l1", auctionId: null, listingId: "l1" });

describe("relais des échanges Discord", () => {
  beforeEach(() => {
    db.post.findUnique.mockResolvedValue(listingPost());
    db.listing.findUnique.mockResolvedValue(listing());
  });
  it("publie la carte proposée et la carte recherchée", async () => {
    expect(await syncDiscordListing("l1")).toBe(true);
    const message = publish.mock.calls[0][1];
    expect(message.embeds[0].fields).toContainEqual({ name: "Carte recherchée", value: "• Naruto · AR", inline: false });
    expect(publish.mock.calls[0][0]).toBe("listing:l1");
    expect(publish.mock.calls[0][2]).toBeInstanceOf(Date);
  });
  it("cache un auteur privé et signale une carte qui n'est plus disponible", async () => {
    db.listing.findUnique.mockResolvedValue({ ...listing(), owner: { ...listing().owner, profileVisibility: "PRIVATE" } });
    db.userCard.count.mockResolvedValue(0);
    await syncDiscordListing("l1");
    const fields = publish.mock.calls[0][1].embeds[0].fields;
    expect(fields[0].value).toBe("Un joueur");
    expect(fields).toContainEqual({ name: "Statut", value: "Carte indisponible", inline: true });
  });
  it("termine la surveillance après expiration et met à jour le message existant", async () => {
    db.post.findUnique.mockResolvedValue({ ...listingPost(), messageId: "123456789012345678" });
    db.listing.findUnique.mockResolvedValue({ ...listing(), expiresAt: new Date(Date.now() - 1000) });
    await syncDiscordListing("l1");
    expect(publish.mock.calls[0][2]).toBeNull();
    expect(publish.mock.calls[0][1].embeds[0].fields).toContainEqual({ name: "Statut", value: "Expirée", inline: true });
  });
  it("ignore un échange terminé avant toute tentative, mais récupère un envoi incertain", async () => {
    db.listing.findUnique.mockResolvedValue({ ...listing(), status: "TRADED" });
    expect(await syncDiscordListing("l1")).toBe(false);
    expect(publish).not.toHaveBeenCalled();
    db.post.findUnique.mockResolvedValue({ ...listingPost(), attempts: 1 });
    expect(await syncDiscordListing("l1")).toBe(true);
    expect(publish.mock.calls[0][2]).toBeNull();
  });
  it("le cron traite les ventes et les échanges dans la même file", async () => {
    db.post.findMany.mockResolvedValue([{ auctionId: "a1", listingId: null }, { auctionId: null, listingId: "l1" }]);
    db.post.findUnique.mockImplementation(async ({ where }) => where.auctionId ? record() : listingPost());
    expect(await syncDiscordMarket()).toEqual({ synced: 2, failed: 0 });
    expect(publish.mock.calls.map(([key]) => key)).toEqual(["auction:a1", "listing:l1"]);
  });
});

describe("relais des ventes Discord", () => {
  it("reste désactivé sans publier ni lire les ventes", async () => {
    state.enabled = false;
    expect(await syncDiscordAuction("a1")).toBe(false);
    expect(db.post.findUnique).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
  it("n'avance pas un envoi différé par Discord", async () => {
    db.post.findUnique.mockResolvedValue({ ...record(), nextAttemptAt: new Date(Date.now() + 60_000) });
    expect(await syncDiscordAuction("a1")).toBe(false);
    expect(db.auction.findUnique).not.toHaveBeenCalled();
  });
  it("cache le vendeur privé comme sur le site", async () => {
    db.auction.findUnique.mockResolvedValue({ ...auction(), seller: { ...auction().seller, profileVisibility: "PRIVATE" } });
    expect(await syncDiscordAuction("a1")).toBe(true);
    const message = publish.mock.calls[0][1];
    expect(message.embeds[0].fields[0].value).toBe("Un joueur");
    expect(JSON.stringify(message)).not.toContain("Sakura");
  });
  it("ignore une vente terminée qui n'a jamais fait l'objet d'un envoi", async () => {
    db.auction.findUnique.mockResolvedValue({ ...auction(), status: "SOLD" });
    expect(await syncDiscordAuction("a1")).toBe(false);
    expect(publish).not.toHaveBeenCalled();
    expect(db.post.updateMany.mock.calls[0][0].data.nextAttemptAt).toBeNull();
  });
  it("récupère un envoi incertain même si la vente est maintenant terminée", async () => {
    db.post.findUnique.mockResolvedValue({ ...record(), attempts: 1 });
    db.auction.findUnique.mockResolvedValue({ ...auction(), status: "SOLD", finalPrice: 2000 });
    expect(await syncDiscordAuction("a1")).toBe(true);
    expect(publish.mock.calls[0][2]).toBeNull();
    expect(publish.mock.calls[0][1].embeds[0].fields).toContainEqual({ name: "Statut", value: "Vendue", inline: true });
  });
});
