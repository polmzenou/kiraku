import { describe, expect, it, vi } from "vitest";
import { fetchCharacterBiography } from "./biography";

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

  it("rejette les erreurs HTTP, GraphQL, réseau et les réponses invalides", async () => {
    await expect(fetchCharacterBiography(42, api({}, 429))).rejects.toThrow("HTTP 429");
    await expect(fetchCharacterBiography(42, api({ data: { Character: null }, errors: [{}] }))).rejects.toThrow("GraphQL");
    await expect(fetchCharacterBiography(42, api({ data: {} }))).rejects.toThrow();
    await expect(fetchCharacterBiography(42, vi.fn<typeof fetch>().mockRejectedValue(new Error("timeout")))).rejects.toThrow("timeout");
  });
});
