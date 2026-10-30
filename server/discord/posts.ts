import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { DiscordMessageBody } from "@/lib/discord/community";
import { prisma } from "../db";
import { env } from "../env";
import { DiscordApiError, discordBotRequest } from "./api";

export type PublishResult = { ok: true; messageId: string } | { ok: false; error: "BUSY" | "DISCORD" };

type Message = { id: string; author?: { id: string }; embeds?: Array<{ url?: string }>; components?: Array<{ components?: Array<{ custom_id?: string }> }> };

// Après un envoi dont la réponse s'est perdue, retrouve le message récent avant d'en créer un autre.
async function recoverMessage(channelId: string, payload: DiscordMessageBody): Promise<string | undefined> {
  const url = payload.embeds?.[0]?.url;
  const customId = payload.components?.[0]?.components[0]?.custom_id;
  if (!env.AUTH_DISCORD_ID || (!url && !customId)) return;
  const messages = await discordBotRequest<Message[]>(`/channels/${channelId}/messages?limit=100`);
  return messages.find((m) => m.author?.id === env.AUTH_DISCORD_ID &&
    (url ? m.embeds?.some((e) => e.url === url) : m.components?.some((r) => r.components?.some((c) => c.custom_id === customId))))?.id;
}

/** Lease partagée en base : deux instances ne publient pas la même annonce simultanément. */
export async function publishDiscordPost(key: string, payload: DiscordMessageBody, nextAttemptAt: Date | null, force = false): Promise<PublishResult> {
  const now = new Date();
  const leaseId = randomUUID();
  const claim = await prisma.discordPost.updateMany({
    where: { key, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
    data: { leaseId, leaseUntil: new Date(now.getTime() + 60_000), attempts: { increment: 1 } },
  });
  if (!claim.count) return { ok: false, error: "BUSY" };
  const post = await prisma.discordPost.findUniqueOrThrow({ where: { key } });
  const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  let messageId = post.messageId;
  try {
    if (!messageId && post.attempts > 1) messageId = await recoverMessage(post.channelId, payload) ?? null;
    if (force || !messageId || payloadHash !== post.payloadHash) {
      if (messageId) {
        try {
          await discordBotRequest(`/channels/${post.channelId}/messages/${messageId}`, "PATCH", payload);
        } catch (e) {
          if (!(e instanceof DiscordApiError) || e.status !== 404) throw e;
          messageId = null;
        }
      }
      if (!messageId) {
        const message = await discordBotRequest<Message>(`/channels/${post.channelId}/messages`, "POST", {
          ...payload,
          // Discord limite le nonce à 25 caractères et déduplique les envois proches.
          nonce: createHash("sha256").update(key).digest("hex").slice(0, 24),
          enforce_nonce: true,
        });
        if (!/^\d{17,20}$/.test(message.id)) throw new DiscordApiError(0);
        messageId = message.id;
      }
    }
    await prisma.discordPost.updateMany({
      where: { key, leaseId },
      data: { messageId, payloadHash, attempts: 0, nextAttemptAt, leaseId: null, leaseUntil: null },
    });
    return { ok: true, messageId };
  } catch (e) {
    const delay = Math.max(e instanceof DiscordApiError ? e.retryAfterMs : 0, Math.min(3_600_000, 30_000 * 2 ** Math.min(post.attempts - 1, 7)));
    await prisma.discordPost.updateMany({
      where: { key, leaseId },
      // Garde l'identifiant si Discord a accepté l'envoi mais que la sauvegarde a échoué.
      data: { ...(messageId && { messageId }), nextAttemptAt: new Date(Date.now() + delay), leaseId: null, leaseUntil: null },
    });
    console.warn(`[discord] publication non synchronisée (${e instanceof DiscordApiError ? e.status : "base"}).`);
    return { ok: false, error: "DISCORD" };
  }
}
