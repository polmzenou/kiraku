"use server";

import { refresh } from "next/cache";
import { rulesMessage } from "@/lib/discord/community";
import { getAdmin } from "../admin";
import { writeAdminLog } from "../admin/log";
import { prisma } from "../db";
import { env, discordRulesConfigured } from "../env";
import { rateLimit } from "../ratelimit";
import { discordBotRequest } from "../discord/api";
import { publishDiscordPost } from "../discord/posts";

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
