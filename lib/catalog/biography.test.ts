import { describe, expect, it, vi } from "vitest";
import { BIOGRAPHY_PAUSE_MS, BiographyFetchError, biographyPauseMs, fetchCharacterBiography } from "./biography";

function api(body: unknown, status = 200) {
  return vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe("lecture de la biographie AniList", () => {
  it("demande du texte brut pour le bon personnage et garde les paragraphes", async () => {
    const fetchFn = api({ data: { Character: { description: "  Biography\n\nSecond paragraph.  " } } });
    expect(await fetchCharacterBiography(42, fetchFn)).toBe("Biography\n\nSecond paragraph.");
    const options = fetchFn.mock.calls[0][1]!;
    expect(JSON.parse(options.body as string)).toEqual({
      query: "query ($id: Int!) { Character(id: $id) { description(asHtml: false) } }",
      variables: { id: 42 },
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.cache).toBe("no-store");
  });

  it("accepte une biographie absente sans l'inventer", async () => {
    expect(await fetchCharacterBiography(42, api({ data: { Character: { description: null } } }))).toBeNull();
    expect(await fetchCharacterBiography(42, api({ data: { Character: null } }))).toBeNull();
  });

  it("lit un personnage retiré d'AniList (404) comme une biographie absente", async () => {
    expect(await fetchCharacterBiography(42, api({ errors: [{ message: "Not Found.", status: 404 }], data: { Character: null } }, 404))).toBeNull();
  });

  it("met les appels en pause après un échec : une minute, ou le Retry-After d'AniList, dix minutes au plus", async () => {
    const limited = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 429, headers: { "retry-after": "120" } }));
    const error = await fetchCharacterBiography(42, limited).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BiographyFetchError);
    expect(biographyPauseMs(error)).toBe(120_000);
    expect(biographyPauseMs(new BiographyFetchError("HTTP 429", 5_000))).toBe(BIOGRAPHY_PAUSE_MS);
    expect(biographyPauseMs(new BiographyFetchError("HTTP 429", 86_400_000))).toBe(600_000);
    expect(biographyPauseMs(new Error("timeout"))).toBe(BIOGRAPHY_PAUSE_MS);
  });

  it("rejette les erreurs HTTP, GraphQL, réseau et les réponses invalides", async () => {
    await expect(fetchCharacterBiography(42, api({}, 429))).rejects.toThrow("HTTP 429");
    await expect(fetchCharacterBiography(42, api({ data: { Character: null }, errors: [{}] }))).rejects.toThrow("GraphQL");
    await expect(fetchCharacterBiography(42, api({ data: {} }))).rejects.toThrow();
    await expect(fetchCharacterBiography(42, vi.fn<typeof fetch>().mockRejectedValue(new Error("timeout")))).rejects.toThrow("timeout");
  });
});
