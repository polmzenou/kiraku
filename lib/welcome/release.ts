/**
 * Annonces présentées une fois chacune par le modal d'accueil, dans l'ordre. `User.v1WelcomeSeenAt`
 * garde la date de la dernière annonce vue : toute annonce plus récente s'affiche une fois, sans migration.
 * Toujours fixer la date d'une nouvelle annonce au moment du déploiement ou après, jamais avant :
 * l'ancienne version note encore la date d'affichage, qui doit rester antérieure.
 */
export const ANNOUNCEMENTS = [
  // Excuses après la panne du 24-25 octobre 2026.
  { key: "apology", at: new Date("2026-10-25T23:00:00Z") },
  // Kiraku-kun v2 : nouveau design, cartes AR et Gold.
  { key: "v2", at: new Date("2026-10-27T18:00:00Z") },
  // Kiraku-kun v2.5 : son modal est retiré, la date reste comme borne. Un nouveau compte ne reçoit
  // donc aucune annonce (pas le vieux modal v2), et les annonces plus anciennes manquées passent toujours.
  { key: "v25", at: new Date("2026-10-30T12:00:00Z") },
] as const;

export type AnnouncementKey = (typeof ANNOUNCEMENTS)[number]["key"];
export type Announcement = { key: AnnouncementKey; at: Date };

/**
 * Prochaine annonce à présenter, la plus ancienne non vue d'abord. Un compte qui n'en a jamais vu
 * aucune ne reçoit que la dernière : les précédentes ne le concernent plus.
 */
export function pendingAnnouncement(seenAt: Date | null, list: readonly Announcement[] = ANNOUNCEMENTS): Announcement | null {
  if (seenAt === null) return list.at(-1) ?? null;
  return list.find((announcement) => seenAt < announcement.at) ?? null;
}
