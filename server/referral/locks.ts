import { checkOwnCardLock, checkPairLock, type LockRefusal, type LockSubject } from "@/lib/referral/locks";
import { parseSetting } from "@/lib/settings/defaults";
import type { Tx } from "../social/lock";

// Verrous de transfert du parrainage v2, appelés dans la transaction de chaque transfert (cadeaux, échanges, annonces
// et offres du Marché, enchères et mises, avis de recherche, pile ou face) ; un test statique vérifie qu'aucun point
// n'est oublié (server/referral/locks.test.ts). Pendant cardLockDays jours après son rattachement, le filleul ne cède
// rien de ce qu'il possède ; pendant pairLockDays jours, rien ne passe de lui à son parrain. Sans filleul v2 en jeu,
// une seule petite lecture (referredAt est nul pour presque tous les joueurs).

export type TransferCheck = {
  /** Joueur qui agit : il cède sa carte, son booster, ses Zeni, ou mise. */
  actorId: string;
  /** L'autre joueur, s'il est connu (une mise en vente publique n'en a pas encore). */
  counterpartyId: string | null;
  /** L'acteur cède quelque chose qu'il possède (carte, booster, sachet), pas seulement des Zeni. */
  ownItems: boolean;
  /** Échange dans les deux sens (vente, troc, mise) : verrouillé entre parrain et filleul quel que soit l'acteur. */
  mutual: boolean;
  now: Date;
};

const KEYS = ["referral.v2.cardLockDays", "referral.v2.pairLockDays"] as const;

export async function checkReferralLocks(tx: Tx, input: TransferCheck): Promise<LockRefusal | null> {
  const ids = input.counterpartyId && input.counterpartyId !== input.actorId ? [input.actorId, input.counterpartyId] : [input.actorId];
  const referred = await tx.user.findMany({ where: { id: { in: ids }, referredAt: { not: null } }, select: { id: true, referredById: true, referredAt: true } });
  if (referred.length === 0) return null;

  const stored = await tx.gameSetting.findMany({ where: { key: { in: [...KEYS] } }, select: { key: true, value: true } });
  const rules = {
    cardLockDays: parseSetting("referral.v2.cardLockDays", stored.find((s) => s.key === KEYS[0])?.value),
    pairLockDays: parseSetting("referral.v2.pairLockDays", stored.find((s) => s.key === KEYS[1])?.value),
  };
  const subject = (id: string): LockSubject => referred.find((r) => r.id === id) ?? { id, referredById: null, referredAt: null };
  const actor = subject(input.actorId);
  if (input.ownItems) {
    const own = checkOwnCardLock(actor, input.now, rules);
    if (own) return own;
  }
  if (input.counterpartyId && input.counterpartyId !== input.actorId) {
    return (
      checkPairLock(actor, input.counterpartyId, input.now, rules) ??
      (input.mutual ? checkPairLock(subject(input.counterpartyId), input.actorId, input.now, rules) : null)
    );
  }
  return null;
}
