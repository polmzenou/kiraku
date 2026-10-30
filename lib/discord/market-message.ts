import { buyoutAvailable } from "@/lib/market/rules";
import { discordText, type DiscordMessageBody } from "./community";

export type DiscordAuction = {
  id: string;
  status: "ACTIVE" | "SOLD" | "EXPIRED" | "CANCELLED";
  startPrice: number;
  buyoutPrice: number | null;
  currentBid: number | null;
  finalPrice: number | null;
  endsAt: Date;
  sellerName: string;
  card: { name: string; imageUrl: string; rarityName: string; series: string };
};

function discordImage(value: string, origin: string): { url: string } | undefined {
  try {
    const url = new URL(value, origin);
    if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password) return { url: url.href };
  } catch { /* Une image invalide n'empêche pas l'annonce. */ }
}

export function auctionMessage(auction: DiscordAuction, origin: string, now = new Date()): DiscordMessageBody {
  const url = new URL(`/marche/${encodeURIComponent(auction.id)}`, origin).href;
  const active = auction.status === "ACTIVE" && auction.endsAt > now;
  const status = auction.status === "SOLD" ? "Vendue" : auction.status === "CANCELLED" ? "Annulée" : auction.status === "EXPIRED" ? "Expirée" : active ? "En cours" : "Terminée — clôture en cours";
  const zeni = (price: number) => `${new Intl.NumberFormat("fr-FR").format(price)} Zeni`;
  const fields = [
    { name: "Vendeur", value: discordText(auction.sellerName, 100), inline: true },
    { name: "Statut", value: status, inline: true },
    { name: auction.status === "SOLD" ? "Prix final" : auction.currentBid === null ? "Enchère de départ" : "Enchère actuelle", value: zeni(auction.finalPrice ?? auction.currentBid ?? auction.startPrice), inline: true },
  ];
  if (active && buyoutAvailable(auction.buyoutPrice, auction.currentBid)) fields.push({ name: "Achat immédiat", value: zeni(auction.buyoutPrice), inline: true });
  fields.push({ name: "Fin de la vente", value: `<t:${Math.floor(auction.endsAt.getTime() / 1000)}:F>`, inline: false });
  const image = discordImage(auction.card.imageUrl, origin);
  return {
    embeds: [{
      title: `${discordText(auction.card.name, 80)} · ${discordText(auction.card.rarityName, 35)}`.slice(0, 256),
      description: discordText(auction.card.series, 200),
      url,
      color: active ? 0xc63f32 : 0x6b7280,
      ...(image && { image }),
      fields,
      footer: { text: "Les prix et la disponibilité sont confirmés sur Kiraku." },
    }],
    components: [{ type: 1, components: [{ type: 2, style: 5, label: active ? "Voir l’annonce sur Kiraku" : "Voir la vente sur Kiraku", url }] }],
    allowed_mentions: { parse: [] },
  };
}

export type DiscordTradeListing = {
  id: string;
  status: "OPEN" | "TRADED" | "CANCELLED" | "EXPIRED" | "FAILED";
  expiresAt: Date;
  ownerName: string;
  available: boolean;
  card: { name: string; imageUrl: string; rarityName: string };
  wants: Array<{ name: string; rarityName: string }>;
};

export function tradeListingMessage(listing: DiscordTradeListing, origin: string, now = new Date()): DiscordMessageBody {
  const url = new URL("/marche", origin);
  url.searchParams.set("onglet", "echanges");
  url.searchParams.set("annonce", listing.id);
  const open = listing.status === "OPEN" && listing.expiresAt > now;
  const active = open && listing.available;
  const status = listing.status === "TRADED" ? "Échange effectué" : listing.status === "CANCELLED" ? "Retirée" :
    listing.status === "EXPIRED" || (listing.status === "OPEN" && !open) ? "Expirée" :
    listing.status === "FAILED" || !listing.available ? "Carte indisponible" : "En cours";
  const label = (card: { name: string; rarityName: string }) => `${discordText(card.name, 65)} · ${discordText(card.rarityName, 25)}`;
  const image = discordImage(listing.card.imageUrl, origin);
  const wantedFields: Array<{ name: string; value: string; inline: boolean }> = [];
  for (const card of listing.wants) {
    const line = `• ${label(card)}`;
    const current = wantedFields.at(-1);
    if (current && current.value.length + line.length + 1 <= 1024) current.value += `\n${line}`;
    else wantedFields.push({
      name: wantedFields.length ? "Cartes recherchées — suite" : listing.wants.length === 1 ? "Carte recherchée" : "Cartes recherchées — une au choix",
      value: line, inline: false,
    });
  }
  if (!wantedFields.length) wantedFields.push({ name: "Cartes recherchées", value: "Voir l’annonce sur Kiraku", inline: false });
  return {
    embeds: [{
      title: `🔄 Échange · ${label(listing.card)}`.slice(0, 256),
      url: url.href,
      color: active ? 0xc63f32 : 0x6b7280,
      ...(image && { image }),
      fields: [
        { name: "Joueur", value: discordText(listing.ownerName, 100), inline: true },
        { name: "Statut", value: status, inline: true },
        { name: "Carte proposée", value: label(listing.card), inline: false },
        ...wantedFields,
        { name: "Expiration", value: `<t:${Math.floor(listing.expiresAt.getTime() / 1000)}:F>`, inline: false },
      ],
      footer: { text: "Échange carte contre carte. La disponibilité est confirmée sur Kiraku." },
    }],
    components: [{ type: 1, components: [{ type: 2, style: 5, label: "Voir l’échange sur Kiraku", url: url.href }] }],
    allowed_mentions: { parse: [] },
  };
}
