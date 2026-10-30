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
  let image: { url: string } | undefined;
  try {
    const imageUrl = new URL(auction.card.imageUrl, origin);
    if (["https:", "http:"].includes(imageUrl.protocol) && !imageUrl.username && !imageUrl.password) image = { url: imageUrl.href };
  } catch { /* Une image invalide n'empêche pas l'annonce. */ }
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
