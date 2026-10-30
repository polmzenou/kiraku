import { createHash } from "node:crypto";
import { config } from "dotenv";
import { gettingStartedMessage } from "../lib/discord/getting-started";
import { autoModRules } from "../lib/discord/automod";
import { discordStaffRole } from "../lib/discord/staff";

config({ path: [".env.local", ".env"], quiet: true });
const mode = process.argv[2];
const apply = process.argv.includes("--apply");
const env = process.env;
const guildId = env.DISCORD_GUILD_ID;
const guideId = env.DISCORD_GUIDE_CHANNEL_ID ?? "1565843323854258276";
const alertsId = env.DISCORD_ALERTS_CHANNEL_ID ?? "1565779152106291380";
const origin = process.argv.find((arg) => arg.startsWith("--origin="))?.slice("--origin=".length) ?? "https://kiraku-kun.com";
type Channel = { id: string; type: number; guild_id: string; permission_overwrites: Array<{ id: string; type: number; allow: string; deny: string }> };
type Role = { id: string; permissions: string };

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`https://discord.com/api/v10${path}`, {
      method, headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
      ...(body !== undefined && { body: JSON.stringify(body) }), signal: AbortSignal.timeout(8000), redirect: "error",
    });
  } catch { throw new Error("Connexion Discord impossible ; vérifier le réseau."); }
  if (!response.ok) throw new Error(`Discord HTTP ${response.status} : vérifier les permissions et la configuration du bot.`);
  return response.status === 204 ? undefined as T : await response.json() as T;
}

async function main() {
  if (!["guide", "automod"].includes(mode)) throw new Error("Usage : node --import tsx scripts/setup-discord-community.mts guide|automod [--apply]");
  if (!env.DISCORD_BOT_TOKEN || !guildId || !/^\d{17,20}$/.test(guildId)) throw new Error("DISCORD_BOT_TOKEN et DISCORD_GUILD_ID sont requis.");
  if (![guideId, alertsId].every((id) => /^\d{17,20}$/.test(id))) throw new Error("Identifiant de salon Discord invalide.");
  // Le guide référence les salons Kiraku existants, pas ceux d'un autre serveur.
  if (guildId !== "1565773684243697905") throw new Error("Ce guide est préparé pour le serveur Kiraku configuré dans docs/DISCORD.md.");
  if (mode === "guide") {
    const channel = await request<Channel>(`/channels/${guideId}`);
    if (channel.guild_id !== guildId || channel.type !== 0) throw new Error("Salon du guide invalide.");
    if (new URL(origin).protocol !== "https:") throw new Error("Le guide doit pointer vers une origine HTTPS publique.");
    const payload = gettingStartedMessage(origin);
    if (!apply) { console.log(JSON.stringify({ channelId: guideId, message: payload }, null, 2)); return; }
    const bot = await request<{ id: string }>("/users/@me");
    const messages = await request<Array<{ id: string; author: { id: string }; embeds?: Array<{ title?: string }> }>>(`/channels/${guideId}/messages?limit=100`);
    const previous = messages.find((message) => message.author.id === bot.id && message.embeds?.[0]?.title === payload.embeds?.[0]?.title);
    const message = previous
      ? await request<{ id: string }>(`/channels/${guideId}/messages/${previous.id}`, "PATCH", payload)
      : await request<{ id: string }>(`/channels/${guideId}/messages`, "POST", { ...payload, nonce: createHash("sha256").update(`guide:${guildId}:${guideId}`).digest("hex").slice(0, 24), enforce_nonce: true });
    console.log(`Guide publié : https://discord.com/channels/${guildId}/${guideId}/${message.id}`);
    return;
  }

  const [channel, roles, bot, existing] = await Promise.all([
    request<Channel>(`/channels/${alertsId}`), request<Role[]>(`/guilds/${guildId}/roles`), request<{ id: string }>("/users/@me"),
    request<Array<{ id: string; name: string; creator_id: string; trigger_type: number; enabled: boolean }>>(`/guilds/${guildId}/auto-moderation/rules`),
  ]);
  const view = 1n << 10n;
  if (channel.guild_id !== guildId || channel.type !== 0 || !channel.permission_overwrites.some((item) => item.id === guildId && (BigInt(item.deny) & view))) throw new Error("Le salon des alertes doit être privé.");
  for (const item of channel.permission_overwrites) {
    if (!(BigInt(item.allow) & view)) continue;
    if (item.type === 1 ? item.id !== bot.id : !roles.some((role) => role.id === item.id && discordStaffRole(role, guildId))) throw new Error("Un accès non réservé à l’équipe existe dans le salon des alertes.");
  }
  const plans = autoModRules(alertsId, roles.filter((role) => discordStaffRole(role, guildId)).map((role) => role.id));
  if (!apply) { console.log(JSON.stringify({ rules: plans }, null, 2)); return; }
  for (const plan of plans) {
    const owned = existing.find((rule) => rule.name === plan.name && rule.creator_id === bot.id && rule.trigger_type === plan.trigger_type);
    if (owned) {
      await request(`/guilds/${guildId}/auto-moderation/rules/${owned.id}`, "PATCH", {
        name: plan.name, event_type: plan.event_type, trigger_metadata: plan.trigger_metadata,
        actions: plan.actions, enabled: plan.enabled, exempt_roles: plan.exempt_roles, exempt_channels: plan.exempt_channels,
      });
      console.log(`Actualisée : ${plan.name}`);
      continue;
    }
    if ([3, 5].includes(plan.trigger_type) && existing.some((rule) => rule.trigger_type === plan.trigger_type)) {
      const current = existing.find((rule) => rule.trigger_type === plan.trigger_type)!;
      console.log(`Conservée : ${current.name} (${current.enabled ? "active" : "désactivée : à activer dans Discord"}).`);
      continue;
    }
    await request(`/guilds/${guildId}/auto-moderation/rules`, "POST", plan);
    console.log(`Activée : ${plan.name}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Configuration Discord impossible.");
  process.exitCode = 1;
});
