/**
 * Mise en ligne de la version présentée par le modal d'accueil (v1.5). `User.v1WelcomeSeenAt` garde la date du
 * dernier affichage : s'il précède cette date, la nouvelle présentation s'affiche une fois, sans migration.
 */
export const RELEASE_ANNOUNCED_AT = new Date("2026-10-20T18:45:00Z");

export function needsReleaseWelcome(seenAt: Date | null, releasedAt: Date = RELEASE_ANNOUNCED_AT): boolean {
  return seenAt === null || seenAt < releasedAt;
}
