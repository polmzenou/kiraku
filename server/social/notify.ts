// Création des notifications, toujours dans la transaction de l'événement qui les cause. Le Web
// Push part après la validation de cette transaction, jamais dedans (voir notifyingTransaction).
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { AuctionPayload, BattlePayload, GiftPayload, NotificationType, TradePayload } from "@/lib/social/notifications";
import type { Tx } from "./lock";

type NewNotification = {
  userId: string;
  type: NotificationType;
  actorId: string;
  refId?: string;
  payload?: GiftPayload | AuctionPayload | BattlePayload | TradePayload;
  now: Date;
};

/** Rappel après validation, avec les ids des notifications créées (le serveur y branche le push). */
export type OnNotified = (notificationIds: string[]) => void;

// Notifications créées par transaction en cours ; le client `tx` est le même objet d'un bout à
// l'autre du rappel de $transaction.
const created = new WeakMap<Tx, string[]>();

/**
 * $transaction interactive dont les notifications créées (par notify) sont remises à `onNotified`
 * une fois la transaction validée. Rien n'est remis si elle échoue.
 */
export async function notifyingTransaction<T>(
  db: PrismaClient,
  fn: (tx: Tx) => Promise<T>,
  options: { maxWait: number; timeout: number },
  onNotified?: OnNotified,
): Promise<T> {
  const ids: string[] = [];
  const result = await db.$transaction(async (tx) => {
    created.set(tx, ids);
    return fn(tx);
  }, options);
  if (onNotified && ids.length > 0) onNotified(ids);
  return result;
}

export async function notify(tx: Tx, n: NewNotification) {
  const row = await tx.notification.create({
    data: {
      userId: n.userId,
      type: n.type,
      actorId: n.actorId,
      refId: n.refId ?? null,
      payload: (n.payload ?? {}) as Prisma.InputJsonValue,
      createdAt: n.now,
    },
    select: { id: true },
  });
  created.get(tx)?.push(row.id);
}

/** Retire la notification de demande d'ami encore non lue (demande annulée, blocage). */
export async function retractFriendRequest(tx: Tx, userId: string, actorId: string) {
  await tx.notification.deleteMany({ where: { userId, actorId, type: "FRIEND_REQUEST", readAt: null } });
}

/** Marque comme lue la notification de demande d'ami (demande traitée depuis /amis ou le profil). */
export async function settleFriendRequest(tx: Tx, userId: string, actorId: string, now: Date) {
  await tx.notification.updateMany({
    where: { userId, actorId, type: "FRIEND_REQUEST", readAt: null },
    data: { readAt: now },
  });
}
