import { z } from "zod";

// Avis des joueurs : règles pures partagées par l'action, la requête et le carrousel.

export const REVIEW_BODY_MAX = 1000;
export const REVIEW_RATINGS = [1, 2, 3, 4, 5] as const;
/** Avis par page du carrousel (3 × 2 sur desktop ; les petits écrans n'en montrent qu'une partie). */
export const REVIEW_PAGE_SIZE = 6;
export const REVIEW_MAX_PAGES = 5;

/** Texte brut : caractères de contrôle retirés (sauf retours à la ligne), trois sauts de ligne au plus. */
export function normalizeReviewBody(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F​-‏‪-‮⁦-⁩]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const reviewInputSchema = z.object({
  rating: z.number().int().min(1).max(5),
  body: z
    .string()
    .max(REVIEW_BODY_MAX * 2)
    .transform(normalizeReviewBody)
    .pipe(z.string().min(1).max(REVIEW_BODY_MAX)),
});

export type ReviewInput = z.infer<typeof reviewInputSchema>;

/** Seuls les comptes liés (Discord ou e-mail), non bannis, donnent leur avis : pas les invités. */
export function canReview(user: { isGuest: boolean; bannedAt: Date | null; role: string } | null): boolean {
  return user !== null && !user.isGuest && user.bannedAt === null && (user.role === "USER" || user.role === "ADMIN");
}

/** Mélange de Fisher-Yates (copie), `random` injectable pour les tests. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Avis épinglés en tête, dans l'ordre reçu (date d'épinglage), puis les autres mélangés. */
export function pinnedFirst<T extends { pinned: boolean }>(items: readonly T[], random: () => number = Math.random): T[] {
  return [...items.filter((r) => r.pinned), ...shuffle(items.filter((r) => !r.pinned), random)];
}

/** Découpe en pages pleines de `size` (la dernière peut être incomplète), `max` pages au plus. */
export function paginate<T>(items: readonly T[], size: number, max: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length && pages.length < max; i += size) pages.push(items.slice(i, i + size));
  return pages;
}

/** Remplissage (0 à 1) de l'étoile `index` (0-basé) pour une note moyenne. */
export function starFill(rating: number, index: number): number {
  return Math.min(1, Math.max(0, rating - index));
}

/** Moyenne arrondie au dixième (null sans avis). */
export function averageRating(sum: number, count: number): number | null {
  return count > 0 ? Math.round((sum / count) * 10) / 10 : null;
}
