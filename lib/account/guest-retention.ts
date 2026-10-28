// Conservation des comptes invités : un invité créé avant la date limite et sans activité depuis
// est supprimé par le cron des comptes (server/account/guest-purge.ts). Logique pure, sans base.

const DAY_MS = 86_400_000;

/** Date limite de la purge, ou null si elle est désactivée (guest.retentionDays = 0). */
export function guestCutoff(now: Date, days: number): Date | null {
  if (!Number.isInteger(days) || days <= 0) return null;
  return new Date(now.getTime() - days * DAY_MS);
}

/**
 * Une session est prolongée à chaque visite (au plus une fois par jour) jusqu'à « visite + durée de
 * session ». Une session qui expire après « date limite + durée de session » a donc servi après la
 * date limite : l'invité est actif.
 */
export function sessionActiveSince(cutoff: Date, sessionMaxAgeSeconds: number): Date {
  return new Date(cutoff.getTime() + sessionMaxAgeSeconds * 1000);
}
