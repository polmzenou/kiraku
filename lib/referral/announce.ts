// Annonce « Le parrainage change » (étape 18e), datée par referral.v2.announceAt comme l'ouverture du casino : présentée
// une fois par compte (lib/welcome/release.ts), aux comptes inscrits avant cette date, pendant announceDays jours. Un
// compte créé ensuite découvre le parrainage par sa page. Pur : le serveur passe les réglages et l'heure.

const DAY = 86_400_000;

export type ReferralAnnouncementRules = { enabled: boolean; announceAt: string | null; announceDays: number };

/** Date de l'annonce pour ce compte, ou null : parrainage v2 coupé, sans date, hors de la fenêtre, invité ou compte plus récent. */
export function referralAnnouncementAt(r: ReferralAnnouncementRules, now: number, user: { isGuest: boolean; createdAt: Date }): Date | null {
  if (!r.enabled || !r.announceAt || user.isGuest) return null;
  const at = new Date(r.announceAt).getTime();
  if (Number.isNaN(at) || now < at || now >= at + r.announceDays * DAY) return null;
  return user.createdAt.getTime() < at ? new Date(at) : null;
}
