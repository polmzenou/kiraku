// Relation entre deux joueurs et décisions sur les demandes d'amis. Fonctions pures : les cœurs
// de server/social/ les appliquent sous verrou, les pages s'en servent pour leurs boutons.

export type FriendshipRow = {
  requesterId: string;
  addresseeId: string;
  status: "PENDING" | "ACCEPTED";
  declinedAt: Date | null;
};

export type Blocks = { byMe: boolean; byThem: boolean };

/**
 * Ce que le joueur voit de sa relation. Un blocage de l'autre côté et une demande refusée ne se
 * voient jamais : BLOCKED_ME se montre comme NONE, une demande que j'ai refusée aussi.
 */
export type Relation = "NONE" | "OUTGOING" | "INCOMING" | "FRIENDS" | "BLOCKED_BY_ME";

/** Clé unique d'une paire, quel que soit le sens (contrainte d'unicité de Friendship). */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function relationBetween(viewerId: string, row: FriendshipRow | null, blocks: Blocks): Relation {
  if (blocks.byMe) return "BLOCKED_BY_ME";
  if (blocks.byThem || !row) return "NONE";
  if (row.status === "ACCEPTED") return "FRIENDS";
  if (row.requesterId === viewerId) return "OUTGOING";
  return row.declinedAt ? "NONE" : "INCOMING";
}

export type SendContext = {
  senderId: string;
  row: FriendshipRow | null;
  blocks: Blocks;
  /** La cible peut-elle recevoir une demande (inscrite, non bannie) ? */
  targetEligible: boolean;
  /** Délai après une annulation ou un retrait encore en cours pour cette paire. */
  cooldownActive: boolean;
  senderFriends: number;
  senderOutgoing: number;
  targetFriends: number;
  limits: { maxFriends: number; maxOutgoing: number };
};

/**
 * Que faire d'une demande d'ami :
 * - CREATE : nouvelle demande, notifiée ;
 * - ACCEPT : l'autre m'avait déjà demandé (même refusée par moi) : on devient amis ;
 * - SILENT : demande créée déjà refusée, sans notification. L'expéditeur voit « Demande envoyée »
 *   exactement comme pour CREATE : rien ne révèle un blocage, un refus, un délai ou un compte inéligible ;
 * - ALREADY : déjà amis ou demande en cours (états que l'expéditeur connaît déjà) ;
 * - SELF, BLOCKED_BY_ME, LIMIT_FRIENDS, LIMIT_OUTGOING : refus qui ne parlent que de l'expéditeur.
 */
export type SendDecision =
  | "CREATE"
  | "ACCEPT"
  | "SILENT"
  | "ALREADY"
  | "SELF"
  | "BLOCKED_BY_ME"
  | "LIMIT_FRIENDS"
  | "LIMIT_OUTGOING";

export function decideSend(ctx: SendContext, targetId: string): SendDecision {
  if (ctx.senderId === targetId) return "SELF";
  if (ctx.blocks.byMe) return "BLOCKED_BY_ME";
  const { row } = ctx;
  if (row?.status === "ACCEPTED") return "ALREADY";
  if (row && row.requesterId === ctx.senderId) return "ALREADY";
  if (ctx.senderFriends >= ctx.limits.maxFriends) return "LIMIT_FRIENDS";
  const incoming = row !== null && row.addresseeId === ctx.senderId;
  if (incoming && !ctx.blocks.byThem && ctx.targetEligible && ctx.targetFriends < ctx.limits.maxFriends) {
    return "ACCEPT";
  }
  if (!incoming && ctx.senderOutgoing >= ctx.limits.maxOutgoing) return "LIMIT_OUTGOING";
  if (incoming || ctx.blocks.byThem || !ctx.targetEligible || ctx.cooldownActive || ctx.targetFriends >= ctx.limits.maxFriends) {
    return "SILENT";
  }
  return "CREATE";
}
