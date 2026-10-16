// Suppression du compte (RGPD) : demande annulable pendant account.deletionGraceDays, puis
// anonymisation. Fonctions pures, partagées par le joueur, le cron et l'admin.

const DAY_MS = 86_400_000;

/** Préfixe des pseudos anonymisés : « supprime-k3x9q2ab » (respecte USERNAME_REGEX). */
export const ANONYMIZED_PREFIX = "supprime-";
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/** Pseudo d'un compte anonymisé, tiré au hasard : il ne dit rien de l'ancien compte. */
export function anonymizedUsername(randomBytes: Uint8Array): string {
  let suffix = "";
  for (let i = 0; i < 8; i++) suffix += ALPHABET[(randomBytes[i] ?? 0) % ALPHABET.length];
  return `${ANONYMIZED_PREFIX}${suffix}`;
}

export function deletionDueAt(requestedAt: Date, graceDays: number): Date {
  return new Date(requestedAt.getTime() + graceDays * DAY_MS);
}

/** Compte gelé : suppression demandée ou déjà anonymisé. Plus aucune écriture de jeu. */
export function isFrozen(user: { deletionRequestedAt: Date | null; anonymizedAt?: Date | null }): boolean {
  return user.deletionRequestedAt !== null || (user.anonymizedAt ?? null) !== null;
}

/** La saisie de confirmation doit reprendre le pseudo exact (casse ignorée, espaces autour tolérés). */
export function confirmsUsername(typed: string, username: string): boolean {
  return typed.trim().toLowerCase() === username.toLowerCase();
}
