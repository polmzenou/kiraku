import { describe, expect, it } from "vitest";
import { rawCharacter } from "@/lib/catalog/fixtures";
import { fetchMediaCharacters } from "./media-import";

/** Faux AniList : une œuvre de `total` personnages, 25 par page, avec des statuts HTTP imposés par page. */
function fakeMedia(total: number, failOn = new Map<number, number[]>()) {
  const pages: number[] = [];
  const fetchFn = (async (_url: string | URL | Request, init?: RequestInit) => {
    const { variables } = JSON.parse(String(init?.body));
    pages.push(variables.page);
    const status = failOn.get(variables.page)?.shift();
    if (status) return new Response("{}", { status, headers: { "retry-after": "1" } });
    const ids = Array.from({ length: total }, (_, i) => i + 1).slice((variables.page - 1) * variables.perPage, variables.page * variables.perPage);
    return Response.json({
      data: {
        Media: {
          id: variables.id,
          type: "ANIME",
          title: { romaji: "Kiraku", english: null },
          characters: {
            pageInfo: { hasNextPage: variables.page * variables.perPage < total },
            edges: ids.map((id) => ({ role: id === 1 ? "MAIN" : "SUPPORTING", node: rawCharacter({ id, favourites: 1000 - id }) })),
          },
        },
      },
    });
  }) as typeof fetch;
  return { fetchFn, pages };
}

const noSleep = async () => {};

describe("fetchMediaCharacters", () => {
  it("parcourt toutes les pages et garde le rôle dans l'œuvre", async () => {
    const { fetchFn, pages } = fakeMedia(60);
    const result = await fetchMediaCharacters(42, { fetch: fetchFn, sleep: noSleep, requestDelayMs: 0, minTagRank: 60 });
    expect(pages).toEqual([1, 2, 3]);
    expect(result?.media).toEqual({ id: 42, type: "ANIME", title: "Kiraku" });
    expect(result?.characters).toHaveLength(60);
    expect(result?.characters[0].mediaRole).toBe("MAIN");
    expect(result?.characters[1].mediaRole).toBe("SUPPORTING");
  });

  it("réessaie la même page après un 429", async () => {
    const { fetchFn, pages } = fakeMedia(30, new Map([[2, [429]]]));
    const result = await fetchMediaCharacters(42, { fetch: fetchFn, sleep: noSleep, requestDelayMs: 0, minTagRank: 60 });
    expect(pages).toEqual([1, 2, 2]);
    expect(result?.characters).toHaveLength(30);
  });

  it("renvoie null pour une œuvre inconnue", async () => {
    const fetchFn = (async () => Response.json({ data: { Media: null } }, { status: 404 })) as unknown as typeof fetch;
    expect(await fetchMediaCharacters(1, { fetch: fetchFn, sleep: noSleep, requestDelayMs: 0, minTagRank: 60 })).toBeNull();
  });
});
