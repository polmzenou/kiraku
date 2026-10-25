/**
 * Mise en ligne du message présenté par le modal d'accueil (excuses après la panne du 24-25 octobre 2026).
 * `User.v1WelcomeSeenAt` garde la date du dernier affichage : s'il précède cette date, le nouveau message
 * s'affiche une fois, sans migration. Toujours la fixer avant le déploiement, jamais après.
 */
export const RELEASE_ANNOUNCED_AT = new Date("2026-10-25T23:00:00Z");

export function needsReleaseWelcome(seenAt: Date | null, releasedAt: Date = RELEASE_ANNOUNCED_AT): boolean {
  return seenAt === null || seenAt < releasedAt;
}
