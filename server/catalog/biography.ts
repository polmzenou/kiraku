import "server-only";
import { unstable_cache } from "next/cache";
import { fetchCharacterBiography } from "@/lib/catalog/biography";

const loadBiography = unstable_cache(fetchCharacterBiographyForCache, ["anilist-character-biography"], { revalidate: 86_400 });

async function fetchCharacterBiographyForCache(anilistId: number) {
  return fetchCharacterBiography(anilistId);
}

export async function getCharacterBiography(anilistId: number) {
  try {
    const text = await loadBiography(anilistId);
    return { status: text ? "ready" as const : "empty" as const, text };
  } catch (error) {
    // Throwing inside the cached callback prevents a temporary failure being cached for a day.
    console.error("[wiki] biography unavailable", error);
    return { status: "unavailable" as const, text: null };
  }
}
