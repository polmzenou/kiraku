import { describe, expect, it } from "vitest";
import { auctionMessage, tradeListingMessage, type DiscordAuction, type DiscordTradeListing } from "./market-message";

const now = new Date("2026-10-30T12:00:00Z");
const auction: DiscordAuction = {
  id: "auction-123", status: "ACTIVE", startPrice: 1000, buyoutPrice: 2500,
  currentBid: null, finalPrice: null, endsAt: new Date("2026-10-30T18:00:00Z"), sellerName: "Sakura",
  card: { name: "Luffy", rarityName: "Gold", imageUrl: "https://images.example/luffy.png", series: "One Piece" },
};

describe("annonce du marché sur Discord", () => {
  it("affiche enchère, achat immédiat, illustration et lien direct de la vente", () => {
    const result = auctionMessage(auction, "https://kiraku.example", now);
    expect(result.embeds![0].url).toBe("https://kiraku.example/marche/auction-123");
    expect(result.embeds![0].image?.url).toBe(auction.card.imageUrl);
    expect(result.embeds![0].fields).toEqual(expect.arrayContaining([
      { name: "Enchère de départ", value: "1 000 Zeni", inline: true },
      { name: "Achat immédiat", value: "2 500 Zeni", inline: true },
    ]));
    expect(result.components![0].components[0].url).toBe(result.embeds![0].url);
    expect(result.allowed_mentions).toEqual({ parse: [] });
  });
  it("retire un achat immédiat devenu indisponible", () => {
    for (const input of [{ ...auction, currentBid: 2500 }, { ...auction, buyoutPrice: null }]) {
      expect(auctionMessage(input, "https://kiraku.example", now).embeds![0].fields!.some((f) => f.name === "Achat immédiat")).toBe(false);
    }
  });
  it("affiche le prix final et l'état fermé après achat", () => {
    const result = auctionMessage({ ...auction, status: "SOLD", finalPrice: 2500 }, "https://kiraku.example", now);
    expect(result.embeds![0].fields).toContainEqual({ name: "Statut", value: "Vendue", inline: true });
    expect(result.embeds![0].fields!.some((f) => f.name === "Achat immédiat")).toBe(false);
    expect(result.embeds![0].fields!.find((f) => f.name === "Prix final")?.value).toContain("500 Zeni");
  });
  it("n'affiche plus d'achat disponible quand la date est dépassée avant clôture", () => {
    const result = auctionMessage(auction, "https://kiraku.example", new Date("2026-10-31"));
    expect(result.embeds![0].fields!.some((f) => f.name === "Achat immédiat")).toBe(false);
    expect(result.embeds![0].fields!.find((f) => f.name === "Statut")?.value).toContain("clôture en cours");
  });
  it("neutralise les mentions et les faux liens des noms, et ignore les images non HTTP", () => {
    const result = auctionMessage({ ...auction, sellerName: "[Admin](https://evil.example) @everyone", card: { ...auction.card, imageUrl: "javascript:alert(1)" } }, "https://kiraku.example", now);
    expect(result.embeds![0].fields![0].value).toContain("\\[Admin\\]");
    expect(result.embeds![0].image).toBeUndefined();
    expect(result.allowed_mentions).toEqual({ parse: [] });
  });
});

const listing: DiscordTradeListing = {
  id: "listing-123", status: "OPEN", expiresAt: new Date("2026-11-01T12:00:00Z"), ownerName: "Sakura", available: true,
  card: { name: "Luffy", rarityName: "Gold", imageUrl: "https://images.example/luffy.png" },
  wants: [{ name: "Naruto", rarityName: "AR" }, { name: "Ichigo", rarityName: "Gold" }],
};

describe("annonce d'échange carte contre carte", () => {
  it("résume l'auteur, la carte et toutes les alternatives recherchées sans montant en Zeni", () => {
    const result = tradeListingMessage(listing, "https://kiraku.example", now);
    const embed = result.embeds![0];
    expect(embed.fields![0]).toEqual({ name: "Joueur", value: "Sakura", inline: true });
    expect(embed.fields!.find((f) => f.name === "Carte proposée")?.value).toBe("Luffy · Gold");
    expect(embed.fields!.find((f) => f.name.includes("une au choix"))?.value).toBe("• Naruto · AR\n• Ichigo · Gold");
    expect(embed.image?.url).toBe(listing.card.imageUrl);
    expect(embed.url).toBe("https://kiraku.example/marche?onglet=echanges&annonce=listing-123");
    expect(result.components![0].components[0].url).toBe(embed.url);
    expect(JSON.stringify(result)).not.toContain("Zeni");
  });
  it.each([
    ["TRADED", "Échange effectué"], ["CANCELLED", "Retirée"], ["FAILED", "Carte indisponible"], ["EXPIRED", "Expirée"],
  ] as const)("actualise le statut %s", (status, label) => {
    const result = tradeListingMessage({ ...listing, status }, "https://kiraku.example", now);
    expect(result.embeds![0].fields).toContainEqual({ name: "Statut", value: label, inline: true });
  });
  it("n'annonce pas une carte indisponible comme échange ouvert", () => {
    const result = tradeListingMessage({ ...listing, available: false }, "https://kiraku.example", now);
    expect(result.embeds![0].fields).toContainEqual({ name: "Statut", value: "Carte indisponible", inline: true });
  });
  it("expire aussi les annonces pas encore clôturées en base", () => {
    const result = tradeListingMessage(listing, "https://kiraku.example", new Date("2026-11-02"));
    expect(result.embeds![0].fields).toContainEqual({ name: "Statut", value: "Expirée", inline: true });
  });
  it("conserve les dix cartes recherchées sans dépasser la taille des champs Discord", () => {
    const wants = Array.from({ length: 10 }, (_, i) => ({ name: `Carte${i}${"*".repeat(60)}`, rarityName: "*".repeat(25) }));
    const result = tradeListingMessage({ ...listing, wants, ownerName: "[Admin](https://evil.example) @everyone" }, "https://kiraku.example", now);
    const fields = result.embeds![0].fields!;
    expect(fields.every((f) => f.value.length <= 1024)).toBe(true);
    for (let i = 0; i < 10; i++) expect(fields.some((f) => f.value.includes(`Carte${i}`))).toBe(true);
    expect(fields[0].value).toContain("\\[Admin\\]");
    expect(result.allowed_mentions).toEqual({ parse: [] });
  });
});
