"use server";

import { after } from "next/server";
import { cleanChatBody } from "@/lib/chat/message";
import { z } from "@/lib/zod";
import { USERNAME_REGEX } from "@/lib/username";
import { isFrozen } from "@/lib/account/deletion";
import {
  canChat,
  createMessage,
  listConversations,
  loadMessages,
  purgeOldMessages,
  unreadChatCount,
  visibleSince,
  type ChatMessageView,
  type Conversation,
} from "../chat/queries";
import { findProfileOwner } from "../collection/profile";
import { rateLimit } from "../ratelimit";
import { publishToUser } from "../realtime";
import { getSetting } from "../settings";
import { getCurrentUser } from "../user";

// Chat entre amis. Ordre des contrôles : session → Zod → compte inscrit non banni → interrupteurs →
// rate limit → amitié et blocages relus en base. Le texte est nettoyé ici et affiché en texte brut.

export type ChatError = "NO_SESSION" | "INVALID" | "GUEST" | "DISABLED" | "RATE_LIMITED" | "UNAVAILABLE" | "NOT_FRIENDS" | "EMPTY";
type Failure = { ok: false; error: ChatError };

const empty = z.object({}).strict();
const conversationSchema = z
  .object({ username: z.string().regex(USERNAME_REGEX), before: z.iso.datetime().optional(), after: z.iso.datetime().optional() })
  .strict();
const sendSchema = z.object({ username: z.string().regex(USERNAME_REGEX), body: z.string().max(2_000) }).strict();

async function guard<S extends z.ZodType>(input: unknown, schema: S, bucket: string, rule: { limit: number; windowSeconds: number }) {
  const user = await getCurrentUser();
  if (!user) return { error: "NO_SESSION" as const };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "INVALID" as const };
  if (user.isGuest) return { error: "GUEST" as const };
  if (user.bannedAt || isFrozen(user)) return { error: "UNAVAILABLE" as const };
  if (!(await getSetting("social.enabled")) || !(await getSetting("chat.enabled"))) return { error: "DISABLED" as const };
  if (!(await rateLimit(`${bucket}:${user.id}`, rule)).success) return { error: "RATE_LIMITED" as const };
  return { user, data: parsed.data as z.infer<S> };
}

/** Ami par pseudo exact, si la conversation est permise. */
async function friend(me: string, username: string) {
  const owner = await findProfileOwner(username);
  if (!owner || !(await canChat(me, owner.id))) return null;
  return owner;
}

/** Pastille : nombre de messages non lus (sondé quand le temps réel est coupé). */
export async function chatStatusAction(input: unknown): Promise<{ ok: true; unread: number } | Failure> {
  const g = await guard(input, empty, "chat-status", { limit: 30, windowSeconds: 60 });
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  const hours = await getSetting("chat.retentionHours");
  // Ménage des messages expirés, au plus une fois toutes les 10 min pour tout le site (les lectures
  // les ignorent déjà : ils disparaissent à l'heure dite, la suppression suit)
  if ((await rateLimit("chat:purge", { limit: 1, windowSeconds: 600 })).success) after(() => purgeOldMessages(hours));
  return { ok: true, unread: await unreadChatCount(g.user.id, visibleSince(hours)) };
}

export async function listConversationsAction(input: unknown): Promise<{ ok: true; conversations: Conversation[] } | Failure> {
  const g = await guard(input, empty, "chat-list", { limit: 30, windowSeconds: 60 });
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  return { ok: true, conversations: await listConversations(g.user.id, visibleSince(await getSetting("chat.retentionHours"))) };
}

/** Messages avec un ami (les reçus passent en lus). */
export async function loadConversationAction(input: unknown): Promise<{ ok: true; messages: ChatMessageView[]; hasMore: boolean } | Failure> {
  const g = await guard(input, conversationSchema, "chat-load", { limit: 60, windowSeconds: 60 });
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  const other = await friend(g.user.id, g.data.username);
  if (!other) return { ok: false, error: "NOT_FRIENDS" };
  const res = await loadMessages(g.user.id, other.id, visibleSince(await getSetting("chat.retentionHours")), {
    before: g.data.before ? new Date(g.data.before) : undefined,
    after: g.data.after ? new Date(g.data.after) : undefined,
  });
  return { ok: true, ...res };
}

export async function sendChatMessageAction(input: unknown): Promise<{ ok: true; message: ChatMessageView } | Failure> {
  const g = await guard(input, sendSchema, "chat-send", { limit: await getSetting("chat.perMinute"), windowSeconds: 60 });
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  const body = cleanChatBody(g.data.body, await getSetting("chat.maxLength"));
  if (!body) return { ok: false, error: "EMPTY" };
  const other = await friend(g.user.id, g.data.username);
  if (!other) return { ok: false, error: "NOT_FRIENDS" };
  const message = await createMessage(g.user.id, other.id, body);
  // Le destinataire le reçoit tout de suite si le temps réel est configuré, sinon au prochain sondage
  after(() => publishToUser(other.id, "chat", { from: g.user.username, message: { ...message, mine: false } }));
  return { ok: true, message };
}
