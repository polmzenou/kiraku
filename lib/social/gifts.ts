// Règles anti-abus des cadeaux entre amis. Fonction pure : gift-core.ts l'applique sous le
// verrou des deux joueurs, la feuille « Offrir » s'en sert pour afficher ce qui reste possible.

export type GiftRules = {
  enabled: boolean;
  perDaySent: number;
  perDayReceived: number;
  minAccountAgeHours: number;
  minFriendshipHours: number;
};

export type GiftPlayer = { isGuest: boolean; bannedAt: Date | null; createdAt: Date };

export type GiftCheck = {
  sender: GiftPlayer;
  recipient: GiftPlayer;
  /** Date d'acceptation de l'amitié, null si les joueurs ne sont pas amis. */
  friendsSince: Date | null;
  /** Un blocage dans un sens ou dans l'autre. */
  blocked: boolean;
  sentToday: number;
  receivedToday: number;
  now: Date;
  rules: GiftRules;
};

export type GiftRefusal =
  | "DISABLED"
  | "GUEST"
  | "BANNED"
  | "NOT_FRIENDS"
  | "ACCOUNT_TOO_NEW"
  | "FRIENDSHIP_TOO_NEW"
  | "SENT_LIMIT"
  | "RECEIVED_LIMIT";

const HOUR = 3_600_000;

/** Première règle enfreinte, ou null si le cadeau est permis. */
export function checkGift(c: GiftCheck): GiftRefusal | null {
  if (!c.rules.enabled) return "DISABLED";
  if (c.sender.isGuest) return "GUEST";
  if (c.sender.bannedAt) return "BANNED";
  // Un destinataire invité, banni ou bloqué ne peut pas être un ami : même réponse
  if (!c.friendsSince || c.blocked || c.recipient.isGuest || c.recipient.bannedAt) return "NOT_FRIENDS";
  if (c.now.getTime() - c.sender.createdAt.getTime() < c.rules.minAccountAgeHours * HOUR) return "ACCOUNT_TOO_NEW";
  if (c.now.getTime() - c.friendsSince.getTime() < c.rules.minFriendshipHours * HOUR) return "FRIENDSHIP_TOO_NEW";
  if (c.sentToday >= c.rules.perDaySent) return "SENT_LIMIT";
  if (c.receivedToday >= c.rules.perDayReceived) return "RECEIVED_LIMIT";
  return null;
}

export type GiftCopy = { id: string; obtainedAt: Date };

/**
 * Exemplaire offert pour une carte : le plus récent hors vitrine, sinon le plus récent exposé
 * (son emplacement est retiré dans la même transaction). Null si le joueur n'en a aucun.
 */
export function pickGiftCopy(copies: readonly GiftCopy[], showcased: ReadonlySet<string>): GiftCopy | null {
  const newestFirst = [...copies].sort((a, b) => b.obtainedAt.getTime() - a.obtainedAt.getTime() || (a.id < b.id ? 1 : -1));
  return newestFirst.find((c) => !showcased.has(c.id)) ?? newestFirst[0] ?? null;
}
