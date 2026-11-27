import { z } from "@/lib/zod";
import { ANILIST_ENDPOINT } from "./anilist";

const biographyResponse = z.object({
  data: z.object({ Character: z.object({ description: z.string().max(100_000).nullable() }).nullable() }),
  errors: z.array(z.unknown()).optional(),
});

/** Pause des appels après un échec : une minute, ou ce que demande AniList (Retry-After), dix minutes au plus. */
export const BIOGRAPHY_PAUSE_MS = 60_000;
const BIOGRAPHY_PAUSE_MAX_MS = 10 * 60_000;

/** Échec d'AniList ; `retryAfterMs` : délai demandé par l'en-tête Retry-After (limite atteinte), sinon null. */
export class BiographyFetchError extends Error {
  constructor(message: string, readonly retryAfterMs: number | null = null) {
    super(message);
  }
}

/** Durée sans appel à AniList après cet échec. */
export function biographyPauseMs(error: unknown): number {
  const asked = error instanceof BiographyFetchError ? (error.retryAfterMs ?? 0) : 0;
  return Math.min(BIOGRAPHY_PAUSE_MAX_MS, Math.max(BIOGRAPHY_PAUSE_MS, asked));
}

/** Raw text only: React escapes it, and paragraph breaks are retained. */
export async function fetchCharacterBiography(anilistId: number, fetchFn: typeof fetch = fetch): Promise<string | null> {
  const response = await fetchFn(ANILIST_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      query: "query ($id: Int!) { Character(id: $id) { description(asHtml: false) } }",
      variables: { id: anilistId },
    }),
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  // Personnage retiré d'AniList (404, Character: null) : biographie vide, mise en cache comme une autre, au lieu
  // d'une erreur relancée à chaque fiche vue
  if (response.status === 404) return null;
  if (!response.ok) {
    const wait = Number(response.headers.get("retry-after"));
    throw new BiographyFetchError(`AniList biography: HTTP ${response.status}`, Number.isFinite(wait) && wait > 0 ? wait * 1000 : null);
  }
  const body = biographyResponse.parse(await response.json());
  if (body.errors?.length) throw new Error("AniList biography: GraphQL error");
  return body.data.Character?.description?.trim() || null;
}
