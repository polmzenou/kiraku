import { describe, expect, it } from "vitest";
import { emptyWikiCollection, selectWikiPage, wikiCardState, type CatalogSearchIndex, type WikiCollection } from "./wiki-state";

const index: CatalogSearchIndex = Array.from({ length: 100 }, (_, i) => [i + 1, i + 1]);
const collection: WikiCollection = {
  available: true,
  hasCards: true,
  cards: new Map([
    [60, { copies: 3, discovered: true }],
    [99, { copies: 1, discovered: true }],
    [2, { copies: 0, discovered: true }],
  ]),
};

describe("wiki possession et découverte", () => {
  it("trouve les cartes possédées au-delà de la première page publique", () => {
    expect(selectWikiPage(index, { ownership: "owned", after: null }, collection)).toEqual({ ids: [60, 99], nextAfter: null });
  });

  it("filtre les manquantes avant de paginer, en conservant un curseur de position", () => {
    const owned = { ...collection, cards: new Map(Array.from({ length: 10 }, (_, i) => [i + 1, { copies: 1, discovered: true }])) };
    const first = selectWikiPage(index, { ownership: "missing", after: null }, owned);
    expect(first.ids).toHaveLength(48);
    expect(first.ids[0]).toBe(11);
    expect(first.nextAfter).toBe(58);
    const second = selectWikiPage(index, { ownership: "missing", after: first.nextAfter }, owned);
    expect(second.ids[0]).toBe(59);
    expect(second.nextAfter).toBeNull();
    expect(first.ids.some((id) => second.ids.includes(id))).toBe(false);
  });

  it("combine la possession avec un index déjà filtré par recherche et rareté", () => {
    const searched: CatalogSearchIndex = [[2, 2], [60, 60]];
    expect(selectWikiPage(searched, { ownership: "owned", after: null }, collection).ids).toEqual([60]);
    expect(selectWikiPage(searched, { ownership: "missing", after: null }, collection).ids).toEqual([2]);
  });

  it("une collection vide ou un visiteur n'a aucune carte possédée", () => {
    const empty = emptyWikiCollection();
    expect(empty.hasCards).toBe(false);
    expect(selectWikiPage(index, { ownership: "owned", after: null }, empty).ids).toEqual([]);
    expect(selectWikiPage(index, { ownership: "missing", after: null }, empty)).toEqual(selectWikiPage(index, { ownership: "all", after: null }, empty));
  });

  it("une découverte sans exemplaires reste débloquée mais compte comme manquante", () => {
    expect(wikiCardState(collection, 2)).toEqual({ copies: 0, discovered: true });
    expect(wikiCardState(collection, 3)).toEqual({ copies: 0, discovered: false });
    expect(selectWikiPage(index, { ownership: "missing", after: null }, collection).ids).toContain(2);
  });

  it("une panne privée n'invente pas de possession ou de découverte", () => {
    const unavailable = emptyWikiCollection(false);
    expect(wikiCardState(unavailable, 60)).toBeNull();
    expect(selectWikiPage(index, { ownership: "owned", after: null }, unavailable)).toEqual(selectWikiPage(index, { ownership: "all", after: null }, unavailable));
  });

  it("pagine dans l'ordre choisi, même quand les numéros des cartes sont décroissants", () => {
    const reversed: CatalogSearchIndex = Array.from({ length: 100 }, (_, i) => [100 - i, i + 1]);
    const first = selectWikiPage(reversed, { ownership: "all", after: null }, collection);
    const second = selectWikiPage(reversed, { ownership: "all", after: first.nextAfter }, collection);
    const third = selectWikiPage(reversed, { ownership: "all", after: second.nextAfter }, collection);
    expect(first.ids).toEqual(Array.from({ length: 48 }, (_, i) => 100 - i));
    expect([...first.ids, ...second.ids, ...third.ids]).toEqual(reversed.map(([id]) => id));
    expect(third.nextAfter).toBeNull();
    expect(selectWikiPage(reversed, { ownership: "owned", after: null }, collection).ids).toEqual([99, 60]);
  });
});
