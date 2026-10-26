import "server-only";
import { decorFromColumns, type PlayerDecor } from "@/lib/profile/decor";
import { pairKey } from "@/lib/social/relation";
import { prisma } from "../db";
import { decorColumns } from "../profile/decor";
import { blocksBetween } from "../social/lock";

// Lectures et écritures du chat entre amis. Seuls des amis acceptés, sans blocage, se parlent.

export const CHAT_PAGE = 40;

export type ChatMessageView = { id: string; mine: boolean; body: string; at: string };

export type Conversation = {
  username: string;
  image: string | null;
  isGuest: boolean;
  decor: PlayerDecor;
  last: { body: string; at: string; mine: boolean } | null;
  unread: number;
};

const view = (me: string) => (m: { id: string; senderId: string; body: string; createdAt: Date }): ChatMessageView => ({
  id: m.id,
  mine: m.senderId === me,
  body: m.body,
  at: m.createdAt.toISOString(),
});

/**
 * Messages éphémères : seuls ceux envoyés après `since` (maintenant moins chat.retentionHours)
 * existent encore aux yeux des joueurs, même avant le passage du ménage.
 */
export const visibleSince = (retentionHours: number, now = new Date()) => new Date(now.getTime() - retentionHours * 3_600_000);

/** Amis acceptés, triés par dernier message, avec les non-lus de chacun. */
export async function listConversations(me: string, since: Date): Promise<Conversation[]> {
  const rows = await prisma.$queryRaw<
    { username: string; image: string | null; isGuest: boolean; body: string | null; lastAt: Date | null; lastMine: boolean | null; unread: number; frameStyle: string | null; nameColor: string | null }[]
  >`
    WITH friends AS (
      SELECT CASE WHEN f."requesterId" = ${me} THEN f."addresseeId" ELSE f."requesterId" END AS id, f."pairKey"
      FROM "Friendship" f
      WHERE f.status = 'ACCEPTED' AND (f."requesterId" = ${me} OR f."addresseeId" = ${me})
    ),
    last AS (
      SELECT DISTINCT ON (m."pairKey") m."pairKey", m.body, m."createdAt", m."senderId"
      FROM "ChatMessage" m
      JOIN friends fr ON fr."pairKey" = m."pairKey"
      WHERE m."createdAt" > ${since}
      ORDER BY m."pairKey", m."createdAt" DESC
    ),
    unread AS (
      SELECT m."senderId", COUNT(*)::int AS n
      FROM "ChatMessage" m
      WHERE m."recipientId" = ${me} AND m."readAt" IS NULL AND m."createdAt" > ${since}
      GROUP BY m."senderId"
    )
    SELECT u.username, u.image, u."isGuest", ${decorColumns}, l.body, l."createdAt" AS "lastAt", (l."senderId" = ${me}) AS "lastMine",
           COALESCE(un.n, 0)::int AS unread
    FROM friends fr
    JOIN "User" u ON u.id = fr.id
    LEFT JOIN last l ON l."pairKey" = fr."pairKey"
    LEFT JOIN unread un ON un."senderId" = fr.id
    WHERE u."bannedAt" IS NULL AND u."anonymizedAt" IS NULL
    ORDER BY l."createdAt" DESC NULLS LAST, u.username ASC
    LIMIT 200`;
  return rows.map((r) => ({
    username: r.username,
    image: r.image,
    isGuest: r.isGuest,
    decor: decorFromColumns(r.frameStyle, r.nameColor),
    last: r.body !== null && r.lastAt ? { body: r.body, at: r.lastAt.toISOString(), mine: r.lastMine === true } : null,
    unread: r.unread,
  }));
}

/** Total des messages non lus (pastille). */
export function unreadChatCount(me: string, since: Date) {
  return prisma.chatMessage.count({ where: { recipientId: me, readAt: null, createdAt: { gt: since } } });
}

/** Les deux joueurs sont-ils amis, sans blocage dans un sens ou l'autre ? */
export async function canChat(me: string, other: string): Promise<boolean> {
  if (me === other) return false;
  const [friendship, blocks] = await Promise.all([
    prisma.friendship.findUnique({ where: { pairKey: pairKey(me, other) }, select: { status: true } }),
    blocksBetween(prisma, me, other),
  ]);
  return friendship?.status === "ACCEPTED" && !blocks.byMe && !blocks.byThem;
}

/**
 * Messages d'une conversation, les plus récents d'abord côté requête puis remis dans l'ordre :
 * `before` remonte l'historique, `after` récupère seulement les nouveaux. Marque les reçus comme lus.
 */
export async function loadMessages(me: string, other: string, since: Date, cursor: { before?: Date; after?: Date }) {
  const key = pairKey(me, other);
  const after = cursor.after && cursor.after > since ? cursor.after : since;
  const rows = await prisma.chatMessage.findMany({
    where: {
      pairKey: key,
      createdAt: { gt: after, ...(cursor.before ? { lt: cursor.before } : {}) },
    },
    orderBy: { createdAt: "desc" },
    take: CHAT_PAGE,
    select: { id: true, senderId: true, body: true, createdAt: true },
  });
  await prisma.chatMessage.updateMany({ where: { pairKey: key, recipientId: me, readAt: null }, data: { readAt: new Date() } });
  return { messages: rows.reverse().map(view(me)), hasMore: !cursor.after && rows.length === CHAT_PAGE };
}

export async function createMessage(me: string, other: string, body: string): Promise<ChatMessageView> {
  const row = await prisma.chatMessage.create({
    data: { pairKey: pairKey(me, other), senderId: me, recipientId: other, body },
    select: { id: true, senderId: true, body: true, createdAt: true },
  });
  return view(me)(row);
}

/** Ménage paresseux : messages arrivés au bout de leur durée de vie. */
export async function purgeOldMessages(retentionHours: number, now = new Date()) {
  await prisma.chatMessage.deleteMany({ where: { createdAt: { lte: visibleSince(retentionHours, now) } } });
}
