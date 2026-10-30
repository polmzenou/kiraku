import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ enabled: true }));
const db = vi.hoisted(() => ({
  post: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  auction: { findUnique: vi.fn() },
}));
const publish = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({ prisma: { discordPost: db.post, auction: db.auction } }));
vi.mock("../env", () => ({ appUrl: () => "https://kiraku.example", discordMarketConfigured: true, env: { DISCORD_MARKET_CHANNEL_ID: "1565793902324219925" } }));
vi.mock("../settings", () => ({ getSetting: async () => state.enabled }));
vi.mock("./posts", () => ({ publishDiscordPost: publish }));
import { syncDiscordAuction } from "./market";

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
  publish.mockResolvedValue({ ok: true, messageId: "123456789012345678" });
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
