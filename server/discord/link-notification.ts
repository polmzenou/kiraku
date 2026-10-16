import "server-only";
import { env } from "../env";

type DiscordLink = {
  discordId: string;
  username?: string;
  displayName?: string | null;
};

function escapeName(value: string): string {
  return value.slice(0, 100).replace(/[\r\n\t]/g, " ").replace(/([\\`*_{}\[\]()<>|~])/g, "\\$1");
}

/** Annonce une première liaison ; un échec Discord ne doit jamais faire échouer la connexion. */
export async function notifyDiscordLink(link: DiscordLink): Promise<boolean> {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_LINK_CHANNEL_ID) return false;

  const name = escapeName(link.displayName || link.username || "Un joueur");
  const username = link.username ? ` (@${escapeName(link.username)})` : "";

  try {
    const response = await fetch(`https://discord.com/api/v10/channels/${env.DISCORD_LINK_CHANNEL_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: `🔗 **${name}**${username} vient de lier son compte Discord à Kiraku !`,
        allowed_mentions: { parse: [] },
        // Discord déduplique aussi les envois proches dans le temps pour cette identité.
        nonce: `link:${link.discordId}`,
        enforce_nonce: true,
      }),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
      redirect: "error",
    });

    if (!response.ok) {
      console.warn(`[discord] annonce de liaison non envoyée (${response.status}).`);
      return false;
    }
    return true;
  } catch {
    // Aucun jeton, nom de joueur ou corps de réponse dans les logs.
    console.warn("[discord] annonce de liaison non envoyée (réseau ou délai dépassé).");
    return false;
  }
}
