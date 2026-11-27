// Règles anti-abus des cadeaux entre amis. Fonction pure : gift-core.ts l'applique sous le
// verrou des deux joueurs, la feuille « Offrir » s'en sert pour afficher ce qui reste possible.
import { isSpecialCopy, type CopyMarks } from "../collection/copies";
import { accountAgeMs } from "../market/rules";

export type GiftRules = {
  enabled: boolean;
  /** Cadeaux envoyés par jour à un même ami. */
  perDaySent: number;
  /** Cadeaux reçus par jour, tous amis confondus. */
  perDayReceived: number;
  minAccountAgeHours: number;
  minFriendshipHours: number;
};

/** `registeredAt` : inscription (posée par trigger) ; absente pour un invité ou un compte d'avant la colonne. */
export type GiftPlayer = { isGuest: boolean; bannedAt: Date | null; createdAt: Date; registeredAt?: Date | null };

export type GiftCheck = {
  sender: GiftPlayer;
  recipient: GiftPlayer;
  /** Date d'acceptation de l'amitié, null si les joueurs ne sont pas amis. */
  friendsSince: Date | null;
  /** Un blocage dans un sens ou dans l'autre. */
  blocked: boolean;
  /** Cadeaux déjà envoyés aujourd'hui à ce destinataire. */
  sentToday: number;
  /** Cadeaux déjà reçus aujourd'hui par le destinataire, de tous ses amis. */
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
  // Depuis l'inscription, comme le Marché et les échanges : un invité ancien tout juste inscrit n'offre pas aussitôt
  if (accountAgeMs(c.sender, c.now) < c.rules.minAccountAgeHours * HOUR) return "ACCOUNT_TOO_NEW";
  if (c.now.getTime() - c.friendsSince.getTime() < c.rules.minFriendshipHours * HOUR) return "FRIENDSHIP_TOO_NEW";
  if (c.sentToday >= c.rules.perDaySent) return "SENT_LIMIT";
  if (c.receivedToday >= c.rules.perDayReceived) return "RECEIVED_LIMIT";
  return null;
}

/** Garde-fous propres aux sachets scellés (le stock gratuit d'un compte secondaire ne doit rien rapporter). */
export type SealedGiftRules = {
  requiresDiscord: boolean;
  minAccountDays: number;
  /** Sachets offerts au plus sur la fenêtre glissante… */
  perWindow: number;
  /** …de ce nombre de jours. */
  windowDays: number;
};

export type SealedGiftRefusal = "NOT_GIFTABLE" | "NEEDS_DISCORD" | "SEALED_ACCOUNT_TOO_NEW" | "SEALED_LIMIT";

/** Début de la fenêtre glissante des sachets offerts. */
export function sealedWindowStart(now: Date, windowDays: number): Date {
  return new Date(now.getTime() - windowDays * 24 * HOUR);
}

/** Première règle enfreinte pour offrir un sachet scellé, vérifiée après checkGift. */
export function checkSealedGift(c: {
  /** Sachet tombé d'un tirage, jamais offert. */
  giftable: boolean;
  hasDiscord: boolean;
  /** Ancienneté comptée depuis l'inscription (registeredAt), sinon depuis la création du compte. */
  sender: Pick<GiftPlayer, "createdAt" | "registeredAt">;
  /** Sachets offerts par l'expéditeur depuis le début de la fenêtre glissante. */
  sentInWindow: number;
  now: Date;
  rules: SealedGiftRules;
}): SealedGiftRefusal | null {
  if (!c.giftable) return "NOT_GIFTABLE";
  if (c.rules.requiresDiscord && !c.hasDiscord) return "NEEDS_DISCORD";
  if (accountAgeMs(c.sender, c.now) < c.rules.minAccountDays * 24 * HOUR) return "SEALED_ACCOUNT_TOO_NEW";
  if (c.sentInWindow >= c.rules.perWindow) return "SEALED_LIMIT";
  return null;
}

export type GiftCopy = { id: string; obtainedAt: Date } & CopyMarks;

/** Le plus récent hors vitrine, sinon le plus récent exposé. */
function newestFree<T extends GiftCopy>(copies: readonly T[], showcased: ReadonlySet<string>): T | null {
  const newestFirst = [...copies].sort((a, b) => b.obtainedAt.getTime() - a.obtainedAt.getTime() || (a.id < b.id ? 1 : -1));
  return newestFirst.find((c) => !showcased.has(c.id)) ?? newestFirst[0] ?? null;
}

/**
 * Exemplaire qui part pour une carte (cadeau, vente, échange, mise) : le plus récent hors vitrine, sinon le
 * plus récent exposé (son emplacement est retiré dans la même transaction), parmi les seuls exemplaires
 * ordinaires. Un exemplaire spécial (héritier ou gravé) ne part jamais par ce choix : le joueur le désigne.
 * Null si le joueur n'a aucun exemplaire ordinaire.
 */
export function pickGiftCopy<T extends GiftCopy>(copies: readonly T[], showcased: ReadonlySet<string>): T | null {
  return newestFree(copies.filter((c) => !isSpecialCopy(c)), showcased);
}

/**
 * Exemplaire prêté à un combat ou à une expédition : un ordinaire d'abord, sinon un spécial. Il ne change pas
 * de main et revient intact, mais il est bloqué pendant ce temps : on garde donc les pièces spéciales libres.
 */
export function pickLoanCopy<T extends GiftCopy>(copies: readonly T[], showcased: ReadonlySet<string>): T | null {
  return pickGiftCopy(copies, showcased) ?? newestFree(copies, showcased);
}
