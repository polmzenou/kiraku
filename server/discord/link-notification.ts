import "server-only";
import { discordText } from "@/lib/discord/community";
import { env } from "../env";
import { DiscordApiError, discordBotRequest } from "./api";

type DiscordLink = {
  discordId: string;
  username?: string;
  displayName?: string | null;
};

/** Annonce une première liaison ; un échec Discord ne doit jamais faire échouer la connexion. */
export async function notifyDiscordLink(link: DiscordLink): Promise<boolean> {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_LINK_CHANNEL_ID) return false;

  const name = discordText(link.displayName || link.username || "Un joueur", 100);
  const username = link.username ? ` (@${discordText(link.username, 100)})` : "";

  try {
    await discordBotRequest(`/channels/${env.DISCORD_LINK_CHANNEL_ID}/messages`, "POST", {
      content: `🔗 **${name}**${username} vient de lier son compte Discord à Kiraku !`,
      allowed_mentions: { parse: [] },
      // Discord déduplique aussi les envois proches dans le temps pour cette identité.
      nonce: `link:${link.discordId}`,
      enforce_nonce: true,
    });
    return true;
  } catch (e) {
    // Aucun jeton, nom de joueur ou corps de réponse dans les logs.
    const status = e instanceof DiscordApiError ? e.status : 0;
    console.warn(status ? `[discord] annonce de liaison non envoyée (${status}).` : "[discord] annonce de liaison non envoyée (réseau ou délai dépassé).");
    return false;
  }
}
