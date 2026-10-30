"use server";

import { refresh } from "next/cache";
import { rulesMessage, rolesMessage } from "@/lib/discord/community";
import { getAdmin } from "../admin";
import { writeAdminLog } from "../admin/log";
import { prisma } from "../db";
import { env, discordRulesConfigured } from "../env";
import { rateLimit } from "../ratelimit";
import { discordBotRequest } from "../discord/api";
import { publishDiscordPost } from "../discord/posts";
import { rolesPanelConfigured, safeCommunityRole, selfRoles } from "../discord/roles-config";
import { discordAlertsConfigured } from "../discord/alert-store";
import { assertPrivateDiscordChannel } from "../discord/private-channel";

export type PublishRulesResult = { ok: true; url: string } | { ok: false; error: "FORBIDDEN" | "CONFIG" | "RATE_LIMITED" | "BUSY" | "DISCORD" };

/** Publication explicite depuis l'admin : met à jour le message existant s'il est déjà publié. */
export async function publishDiscordRulesAction(): Promise<PublishRulesResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  if (!discordRulesConfigured) return { ok: false, error: "CONFIG" };
  if (!(await rateLimit(`discord-rules:${admin.id}`, { limit: 3, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };
  try {
    const channel = await discordBotRequest<{ guild_id: string; type: number }>(`/channels/${env.DISCORD_RULES_CHANNEL_ID}`);
    if (channel.guild_id !== env.DISCORD_GUILD_ID || ![0, 5].includes(channel.type)) return { ok: false, error: "CONFIG" };
    const key = `rules:${env.DISCORD_GUILD_ID}:${env.DISCORD_RULES_CHANNEL_ID}`;
    await prisma.discordPost.upsert({
      where: { key }, update: {}, create: { key, channelId: env.DISCORD_RULES_CHANNEL_ID! },
    });
    const result = await publishDiscordPost(key, rulesMessage(), null, true);
    if (!result.ok) return result;
    await writeAdminLog(prisma, {
      adminId: admin.id, action: "DISCORD_RULES_PUBLISH", targetType: "DiscordPost", targetId: key,
      after: { channelId: env.DISCORD_RULES_CHANNEL_ID, messageId: result.messageId },
    });
    refresh();
    return { ok: true, url: `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${env.DISCORD_RULES_CHANNEL_ID}/${result.messageId}` };
  } catch {
    console.warn("[discord] publication du règlement indisponible.");
    return { ok: false, error: "DISCORD" };
  }
}

export async function publishDiscordRolesAction(): Promise<PublishRulesResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  if (!rolesPanelConfigured()) return { ok: false, error: "CONFIG" };
  if (!(await rateLimit(`discord-roles:${admin.id}`, { limit: 3, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };
  try {
    const [channel, available] = await Promise.all([
      discordBotRequest<{ guild_id: string; type: number }>(`/channels/${env.DISCORD_ROLES_CHANNEL_ID}`),
      discordBotRequest<Array<{ id: string; managed?: boolean; permissions: string }>>(`/guilds/${env.DISCORD_GUILD_ID}/roles`),
    ]);
    const roles = selfRoles();
    if (channel.guild_id !== env.DISCORD_GUILD_ID || ![0, 5].includes(channel.type) ||
      roles.some((role) => !available.some((candidate) => candidate.id === role.id && safeCommunityRole(candidate, env.DISCORD_GUILD_ID!)))) return { ok: false, error: "CONFIG" };
    const key = `roles:${env.DISCORD_GUILD_ID}:${env.DISCORD_ROLES_CHANNEL_ID}`;
    await prisma.discordPost.upsert({ where: { key }, update: {}, create: { key, channelId: env.DISCORD_ROLES_CHANNEL_ID! } });
    const result = await publishDiscordPost(key, rolesMessage(roles), null, true);
    if (!result.ok) return result;
    await writeAdminLog(prisma, { adminId: admin.id, action: "DISCORD_ROLES_PUBLISH", targetType: "DiscordPost", targetId: key, after: { messageId: result.messageId } });
    refresh();
    return { ok: true, url: `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${env.DISCORD_ROLES_CHANNEL_ID}/${result.messageId}` };
  } catch {
    console.warn("[discord] publication des rôles indisponible.");
    return { ok: false, error: "DISCORD" };
  }
}

export async function testDiscordAlertsAction(): Promise<PublishRulesResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  if (!discordAlertsConfigured()) return { ok: false, error: "CONFIG" };
  if (!(await rateLimit(`discord-alert-test:${admin.id}`, { limit: 3, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };
  try {
    await assertPrivateDiscordChannel(env.DISCORD_ALERTS_CHANNEL_ID!);
    const key = `alert:test:${env.DISCORD_GUILD_ID}:${env.DISCORD_ALERTS_CHANNEL_ID}`;
    await prisma.discordPost.upsert({ where: { key }, update: {}, create: { key, channelId: env.DISCORD_ALERTS_CHANNEL_ID! } });
    const result = await publishDiscordPost(key, {
      content: "🧪 **Test des alertes techniques Kiraku**\nCe salon privé recevra les incidents du marché Discord, des attributions de rôles et des bilans de saison. Les répétitions seront regroupées et les résolutions actualiseront le même message.",
      allowed_mentions: { parse: [] },
    }, null, true);
    if (!result.ok) return result;
    await writeAdminLog(prisma, { adminId: admin.id, action: "DISCORD_ALERT_TEST", targetType: "DiscordPost", targetId: key, after: { messageId: result.messageId } });
    return { ok: true, url: `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${env.DISCORD_ALERTS_CHANNEL_ID}/${result.messageId}` };
  } catch {
    console.warn("[discord] test des alertes indisponible (salon privé et permissions requis).");
    return { ok: false, error: "DISCORD" };
  }
}
