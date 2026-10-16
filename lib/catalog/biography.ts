import { z } from "@/lib/zod";
import { ANILIST_ENDPOINT } from "./anilist";

const biographyResponse = z.object({
  data: z.object({ Character: z.object({ description: z.string().max(100_000).nullable() }).nullable() }),
  errors: z.array(z.unknown()).optional(),
});

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
  if (!response.ok) throw new Error(`AniList biography: HTTP ${response.status}`);
  const body = biographyResponse.parse(await response.json());
  if (body.errors?.length) throw new Error("AniList biography: GraphQL error");
  return body.data.Character?.description?.trim() || null;
}
