import "server-only";
import { unstable_cache } from "next/cache";
import { biographyPauseMs, fetchCharacterBiography } from "@/lib/catalog/biography";

const loadBiography = unstable_cache(fetchCharacterBiographyForCache, ["anilist-character-biography"], { revalidate: 86_400 });

// Après un échec (limite d'AniList atteinte, panne, délai dépassé), plus aucun appel pendant la pause : un échec
// n'est pas mis en cache, et sans elle chaque fiche vue relançait la requête et prolongeait le blocage. Les
// biographies déjà en cache restent servies (ce rappel n'est appelé que pour une biographie absente du cache).
let pausedUntil = 0;

class BiographyPaused extends Error {}

async function fetchCharacterBiographyForCache(anilistId: number) {
  if (Date.now() < pausedUntil) throw new BiographyPaused();
  try {
    return await fetchCharacterBiography(anilistId);
  } catch (error) {
    pausedUntil = Date.now() + biographyPauseMs(error);
    throw error;
  }
}

export async function getCharacterBiography(anilistId: number) {
  try {
    const text = await loadBiography(anilistId);
    return { status: text ? "ready" as const : "empty" as const, text };
  } catch (error) {
    // Throwing inside the cached callback prevents a temporary failure being cached for a day.
    if (!(error instanceof BiographyPaused)) console.error("[wiki] biography unavailable", error);
    return { status: "unavailable" as const, text: null };
  }
}
