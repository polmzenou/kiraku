import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { DiscordMessageBody } from "@/lib/discord/community";
import { snowflakeDate } from "@/lib/discord/snowflake";
import { prisma } from "../db";
import { env } from "../env";
import { DiscordApiError, discordBotRequest } from "./api";
import { recordDiscordAlert, resolveDiscordAlert } from "./alert-store";

export type PublishResult = { ok: true; messageId: string } | { ok: false; error: "BUSY" | "DISCORD" };

type Message = { id: string; author?: { id: string }; embeds?: Array<{ url?: string }>; components?: Array<{ components?: Array<{ custom_id?: string }> }> };
export type DiscordPostOptions = { mentionRoleId?: string; attachment?: { filename: string; data: Uint8Array; contentType: string } };

// Écart d'horloge toléré entre le VPS et Discord pour la date lue dans l'identifiant d'un message
const CLOCK_SKEW_MS = 60_000;

/** Incident d'une publication : un par salon (une permission cassée ne crée pas un incident par annonce). */
export const publicationAlertSource = (channelId: string) => `channel:${channelId}`;

function messageBody(payload: DiscordMessageBody, options: DiscordPostOptions, creating: boolean): unknown {
  const value = {
    ...payload,
    ...(creating && options.mentionRoleId && {
      content: `<@&${options.mentionRoleId}>${payload.content ? `\n${payload.content}` : ""}`,
      allowed_mentions: { parse: [], roles: [options.mentionRoleId] },
    }),
    ...(options.attachment && { attachments: [{ id: 0, filename: options.attachment.filename }] }),
  };
  if (!options.attachment) return value;
  const form = new FormData();
  form.set("payload_json", JSON.stringify(value));
  form.set("files[0]", new Blob([new Uint8Array(options.attachment.data)], { type: options.attachment.contentType }), options.attachment.filename);
  return form;
}

/**
 * Repère propre à la clé, posé en fragment sur l'URL de l'encadré : plusieurs annonces pointent vers la même page
 * (étapes d'un même parrainage, paliers de l'Ennichi, teaser et ouverture du casino), la reprise ne les confond pas.
 */
function marked(payload: DiscordMessageBody, key: string): DiscordMessageBody {
  const [first, ...rest] = payload.embeds ?? [];
  if (!first?.url) return payload;
  try {
    const url = new URL(first.url);
    url.hash = `k=${createHash("sha256").update(key).digest("hex").slice(0, 12)}`;
    return { ...payload, embeds: [{ ...first, url: url.href }, ...rest] };
  } catch {
    return payload;
  }
}

/**
 * Après un envoi dont l'issue est inconnue (réseau, 5xx, réponse illisible), retrouve le message avant d'en créer un
 * autre. Seul un message du bot, posté depuis la mise en file de l'annonce, compte : avec un encadré, il doit porter le
 * repère de la clé ; sans encadré, le bouton du message (règlement, rôles : un seul message de ce type par salon).
 */
async function recoverMessage(post: { channelId: string; createdAt: Date }, payload: DiscordMessageBody): Promise<string | undefined> {
  const url = payload.embeds?.[0]?.url;
  const customId = payload.components?.[0]?.components[0]?.custom_id;
  if (!env.AUTH_DISCORD_ID || (!url && !customId)) return;
  const since = post.createdAt.getTime() - CLOCK_SKEW_MS;
  const messages = await discordBotRequest<Message[]>(`/channels/${post.channelId}/messages?limit=100`);
  return messages.find((m) => m.author?.id === env.AUTH_DISCORD_ID && (snowflakeDate(m.id)?.getTime() ?? 0) >= since &&
    (url ? m.embeds?.some((e) => e.url === url) : m.components?.some((r) => r.components?.some((c) => c.custom_id === customId))))?.id;
}

/** Lease partagée en base : deux instances ne publient pas la même annonce simultanément. */
export async function publishDiscordPost(key: string, payload: DiscordMessageBody, nextAttemptAt: Date | null, force = false, options: DiscordPostOptions = {}): Promise<PublishResult> {
  const payloadHash = createHash("sha256").update(JSON.stringify(payload)).update(options.attachment?.data ?? "").digest("hex");
  // Annonce déjà publiée, contenu inchangé, aucun échec en cours (cas des ventes actives relues par le cron) : seule la
  // prochaine relecture est replanifiée, en une écriture, sans lease, sans appel Discord ni incident à résoudre.
  if (!force) {
    const current = await prisma.discordPost.findUnique({ where: { key }, select: { messageId: true, payloadHash: true, attempts: true } });
    if (current?.messageId && current.payloadHash === payloadHash && current.attempts === 0) {
      const now = new Date();
      const kept = await prisma.discordPost.updateMany({
        where: { key, messageId: current.messageId, payloadHash, attempts: 0, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
        data: { nextAttemptAt },
      });
      return kept.count ? { ok: true, messageId: current.messageId } : { ok: false, error: "BUSY" };
    }
  }
  const now = new Date();
  const leaseId = randomUUID();
  const claim = await prisma.discordPost.updateMany({
    where: { key, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
    data: { leaseId, leaseUntil: new Date(now.getTime() + 60_000), attempts: { increment: 1 } },
  });
  if (!claim.count) return { ok: false, error: "BUSY" };
  const post = await prisma.discordPost.findUniqueOrThrow({ where: { key } });
  const body = marked(payload, key);
  let messageId = post.messageId;
  // Création partie sans issue connue : gardée jusqu'à ce que le message soit retrouvé ou confirmé
  let sendStartedAt = post.sendStartedAt;
  try {
    if (!messageId && sendStartedAt) messageId = await recoverMessage(post, body) ?? null;
    if (force || !messageId || payloadHash !== post.payloadHash) {
      if (messageId) {
        try {
          await discordBotRequest(`/channels/${post.channelId}/messages/${messageId}`, "PATCH", messageBody(body, options, false));
        } catch (e) {
          if (!(e instanceof DiscordApiError) || e.status !== 404) throw e;
          messageId = null;
        }
      }
      if (!messageId) {
        // Noté avant l'envoi : si le processus ou la base tombent pendant l'appel, la tentative suivante cherche le message
        const startedAt = new Date();
        await prisma.discordPost.updateMany({ where: { key, leaseId }, data: { sendStartedAt: startedAt } });
        let message: Message;
        try {
          message = await discordBotRequest<Message>(`/channels/${post.channelId}/messages`, "POST", messageBody({
            ...body,
            // Discord limite le nonce à 25 caractères et déduplique les envois proches.
            nonce: createHash("sha256").update(key).digest("hex").slice(0, 24),
            enforce_nonce: true,
          } as DiscordMessageBody, options, true));
          if (!/^\d{17,20}$/.test(message.id)) throw new DiscordApiError(0);
        } catch (e) {
          // 429 ou autre 4xx : Discord a refusé l'envoi, aucun message n'existe. Réseau, 5xx ou réponse illisible : il a pu
          // partir, la tentative suivante le cherche avant d'en créer un autre.
          if (!(e instanceof DiscordApiError && e.status >= 400 && e.status < 500)) sendStartedAt = startedAt;
          throw e;
        }
        messageId = message.id;
      }
    }
    await prisma.discordPost.updateMany({
      where: { key, leaseId },
      data: { messageId, payloadHash, attempts: 0, nextAttemptAt, sendStartedAt: null, leaseId: null, leaseUntil: null },
    });
    // Un incident n'existe qu'après un échec de cette annonce (tentatives précédentes non remises à zéro)
    if (post.attempts > 1 && !key.startsWith("alert:")) await resolveDiscordAlert("publication", publicationAlertSource(post.channelId));
    return { ok: true, messageId };
  } catch (e) {
    const delay = Math.max(e instanceof DiscordApiError ? e.retryAfterMs : 0, Math.min(3_600_000, 30_000 * 2 ** Math.min(post.attempts - 1, 7)));
    await prisma.discordPost.updateMany({
      where: { key, leaseId },
      // Garde l'identifiant si Discord a accepté l'envoi mais que la sauvegarde a échoué.
      data: { ...(messageId && { messageId }), sendStartedAt: messageId ? null : sendStartedAt, nextAttemptAt: new Date(Date.now() + delay), leaseId: null, leaseUntil: null },
    });
    console.warn(`[discord] publication non synchronisée (${e instanceof DiscordApiError ? e.status : "base"}).`);
    if (!key.startsWith("alert:")) await recordDiscordAlert("publication", publicationAlertSource(post.channelId), e instanceof DiscordApiError ? e.status : undefined);
    return { ok: false, error: "DISCORD" };
  }
}

/** Annonce abandonnée avant son premier envoi (objet disparu ou déjà terminé) : elle sort de la file. */
export async function dropDiscordPost(key: string): Promise<void> {
  await prisma.discordPost.updateMany({ where: { key, messageId: null }, data: { nextAttemptAt: null } });
}
