import "server-only";
import { pairKey } from "@/lib/social/relation";
import { prisma } from "../db";
import { blocksBetween } from "../social/lock";

// Lectures et écritures du chat entre amis. Seuls des amis acceptés, sans blocage, se parlent.

export const CHAT_PAGE = 40;

export type ChatMessageView = { id: string; mine: boolean; body: string; at: string };

export type Conversation = {
  username: string;
  image: string | null;
  isGuest: boolean;
  last: { body: string; at: string; mine: boolean } | null;
  unread: number;
};

const view = (me: string) => (m: { id: string; senderId: string; body: string; createdAt: Date }): ChatMessageView => ({
  id: m.id,
  mine: m.senderId === me,
  body: m.body,
  at: m.createdAt.toISOString(),
});

/** Amis acceptés, triés par dernier message, avec les non-lus de chacun. */
export async function listConversations(me: string): Promise<Conversation[]> {
  const rows = await prisma.$queryRaw<
    { username: string; image: string | null; isGuest: boolean; body: string | null; lastAt: Date | null; lastMine: boolean | null; unread: number }[]
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
      ORDER BY m."pairKey", m."createdAt" DESC
    ),
    unread AS (
      SELECT m."senderId", COUNT(*)::int AS n
      FROM "ChatMessage" m
      WHERE m."recipientId" = ${me} AND m."readAt" IS NULL
      GROUP BY m."senderId"
    )
    SELECT u.username, u.image, u."isGuest", l.body, l."createdAt" AS "lastAt", (l."senderId" = ${me}) AS "lastMine",
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
    last: r.body !== null && r.lastAt ? { body: r.body, at: r.lastAt.toISOString(), mine: r.lastMine === true } : null,
    unread: r.unread,
  }));
}

/** Total des messages non lus (pastille). */
export function unreadChatCount(me: string) {
  return prisma.chatMessage.count({ where: { recipientId: me, readAt: null } });
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
export async function loadMessages(me: string, other: string, cursor: { before?: Date; after?: Date }) {
  const key = pairKey(me, other);
  const rows = await prisma.chatMessage.findMany({
    where: {
      pairKey: key,
      ...(cursor.before ? { createdAt: { lt: cursor.before } } : {}),
      ...(cursor.after ? { createdAt: { gt: cursor.after } } : {}),
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

/** Ménage paresseux : messages plus vieux que la durée de conservation. */
export async function purgeOldMessages(retentionDays: number, now = new Date()) {
  await prisma.chatMessage.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - retentionDays * 86_400_000) } } });
}
