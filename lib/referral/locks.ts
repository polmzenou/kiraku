import type { ReferralV2Rules } from "./rules";

// Verrous de transfert du parrainage v2. Pendant cardLockDays jours après son rattachement, les cartes du filleul ne se
// vendent, ne s'offrent, ne s'échangent ni ne se misent ; pendant pairLockDays jours, rien ne passe du filleul à son
// parrain (l'inverse reste permis). Seul un rattachement v2 pose referredAt : un ancien filleul n'est pas verrouillé.

export type LockRefusal = "REFEREE_LOCKED" | "PAIR_LOCKED";

export type LockSubject = { id: string; referredById: string | null; referredAt: Date | null };

const DAY = 86_400_000;

/** Fin d'un verrou de `days` jours, ou null sans rattachement v2. */
export function lockEnd(subject: Pick<LockSubject, "referredAt">, days: number): Date | null {
  return subject.referredAt ? new Date(subject.referredAt.getTime() + days * DAY) : null;
}

/** Le joueur cède une de ses cartes (vente, cadeau, échange, mise) : refusé s'il est un filleul encore verrouillé. */
export function checkOwnCardLock(owner: LockSubject, now: Date, rules: Pick<ReferralV2Rules, "cardLockDays">): LockRefusal | null {
  const end = lockEnd(owner, rules.cardLockDays);
  return end && now.getTime() < end.getTime() ? "REFEREE_LOCKED" : null;
}

/** Quelque chose passe de `from` à `toId` : refusé si `toId` est le parrain de `from` et que le verrou court encore. */
export function checkPairLock(from: LockSubject, toId: string, now: Date, rules: Pick<ReferralV2Rules, "pairLockDays">): LockRefusal | null {
  if (from.referredById === null || from.referredById !== toId) return null;
  const end = lockEnd(from, rules.pairLockDays);
  return end && now.getTime() < end.getTime() ? "PAIR_LOCKED" : null;
}
