import { WIKI_PAGE_SIZE, type WikiParams } from "./wiki-params";

/** Compact, public, rank-ordered search results. Never contains a viewer's collection. */
export type CatalogSearchIndex = readonly (readonly [anilistId: number, rank: number])[];
export type WikiCardState = { copies: number; discovered: boolean };
export type WikiCollection = {
  available: boolean;
  hasCards: boolean;
  cards: ReadonlyMap<number, WikiCardState>;
};

export function emptyWikiCollection(available = true): WikiCollection {
  return { available, hasCards: false, cards: new Map() };
}

export function wikiCardState(collection: WikiCollection, anilistId: number): WikiCardState | null {
  if (!collection.available) return null;
  return collection.cards.get(anilistId) ?? { copies: 0, discovered: false };
}

/** Ownership is applied BEFORE the cursor and limit, including cards beyond the public first page. */
export function selectWikiPage(
  index: CatalogSearchIndex,
  params: Pick<WikiParams, "ownership" | "after">,
  collection: WikiCollection,
) {
  const rows = index.filter(([id, rank]) => {
    if (params.after !== null && rank <= params.after) return false;
    if (!collection.available || params.ownership === "all") return true;
    const owned = (collection.cards.get(id)?.copies ?? 0) > 0;
    return params.ownership === "owned" ? owned : !owned;
  });
  const page = rows.slice(0, WIKI_PAGE_SIZE);
  return {
    ids: page.map(([id]) => id),
    nextAfter: rows.length > WIKI_PAGE_SIZE ? page.at(-1)![1] : null,
  };
}
