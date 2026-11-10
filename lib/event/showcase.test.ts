import { describe, expect, it } from "vitest";
import { entrySlots, entrySnapshot, pageOf, parseEntryCards, rankEntries, seededOrder, showcaseEventPhase, voteError } from "./showcase";

const START = "2026-12-01T18:00:00.000Z";
const END = "2026-12-08T18:00:00.000Z";

describe("phase de l'event vitrines", () => {
  it("à venir, en cours puis terminé, fin exclue", () => {
    expect(showcaseEventPhase(START, END, Date.parse(START) - 1)).toBe("upcoming");
    expect(showcaseEventPhase(START, END, Date.parse(START))).toBe("live");
    expect(showcaseEventPhase(START, END, Date.parse(END) - 1)).toBe("live");
    expect(showcaseEventPhase(START, END, Date.parse(END))).toBe("ended");
  });
  it("pas de phase sans fenêtre valide", () => {
    expect(showcaseEventPhase(END, START, Date.parse(START))).toBeNull();
    expect(showcaseEventPhase("n'importe quoi", END, 0)).toBeNull();
  });
});

describe("photo de la vitrine engagée", () => {
  it("garde les cases de la disposition, une carte par case, triées", () => {
    const result = entrySnapshot(
      [{ position: 3, cardId: "c" }, { position: 1, cardId: "a" }, { position: 1, cardId: "doublon" }, { position: 9, cardId: "hors-grille" }],
      "GRID_3X2",
      1,
    );
    expect(result).toEqual({ ok: true, cards: [{ position: 1, cardId: "a" }, { position: 3, cardId: "c" }] });
  });
  it("refuse une vitrine sous le minimum, et toujours une vitrine vide", () => {
    expect(entrySnapshot([{ position: 1, cardId: "a" }], "GRID_3X2", 2)).toEqual({ ok: false, error: "TOO_FEW_CARDS" });
    expect(entrySnapshot([], "GRID_3X2", 0)).toEqual({ ok: false, error: "TOO_FEW_CARDS" });
  });
  it("relit les cartes enregistrées et remplit les cases", () => {
    const cards = parseEntryCards([{ position: 2, cardId: "b" }, { position: 1, cardId: "a" }]);
    expect(entrySlots(cards, "GRID_3X2", (id) => (id === "a" ? "A" : undefined))).toEqual(["A", null, null, null, null, null]);
    expect(parseEntryCards("cassé")).toEqual([]);
    expect(parseEntryCards([{ position: 0, cardId: "a" }])).toEqual([]);
  });
});

describe("vote", () => {
  const base = { enabled: true, phase: "live" as const, edition: "vitrines-1", entry: { edition: "vitrines-1", userId: "auteur" }, voterId: "votant" };
  it("autorise un vote pour la vitrine d'un autre pendant l'event", () => {
    expect(voteError(base)).toBeNull();
  });
  it("refuse sa propre vitrine, une autre édition, et hors de la période", () => {
    expect(voteError({ ...base, voterId: "auteur" })).toBe("OWN_ENTRY");
    expect(voteError({ ...base, entry: { edition: "vitrines-0", userId: "auteur" } })).toBe("NOT_FOUND");
    expect(voteError({ ...base, entry: null })).toBe("NOT_FOUND");
    expect(voteError({ ...base, phase: "ended" })).toBe("CLOSED");
    expect(voteError({ ...base, phase: "upcoming" })).toBe("CLOSED");
    expect(voteError({ ...base, enabled: false })).toBe("CLOSED");
  });
});

describe("classement", () => {
  it("trie par votes, puis par score atteint le plus tôt, puis par inscription", () => {
    const ranked = rankEntries([
      { entryId: "tardif", votes: 5, lastVoteAt: 300, createdAt: 1 },
      { entryId: "zero", votes: 0, lastVoteAt: null, createdAt: 0 },
      { entryId: "premier", votes: 7, lastVoteAt: 900, createdAt: 5 },
      { entryId: "rapide", votes: 5, lastVoteAt: 200, createdAt: 9 },
      { entryId: "zero-tard", votes: 0, lastVoteAt: null, createdAt: 4 },
    ]);
    expect(ranked.map((r) => [r.entryId, r.rank])).toEqual([["premier", 1], ["rapide", 2], ["tardif", 3], ["zero", 4], ["zero-tard", 5]]);
  });
});

describe("galerie", () => {
  const ids = Array.from({ length: 30 }, (_, i) => `e${i}`);
  it("mélange de façon stable, sans perdre ni doubler d'inscription", () => {
    const a = seededOrder(ids, "joueur:vitrines-1");
    expect(seededOrder([...ids].reverse(), "joueur:vitrines-1")).toEqual(a);
    expect([...a].sort()).toEqual([...ids].sort());
    expect(seededOrder(ids, "autre:vitrines-1")).not.toEqual(a);
  });
  it("borne la page demandée", () => {
    expect(pageOf(ids, 2, 12)).toEqual({ items: ids.slice(12, 24), page: 2, pages: 3 });
    expect(pageOf(ids, 99, 12).page).toBe(3);
    expect(pageOf(ids, -4, 12).page).toBe(1);
    expect(pageOf([], 1, 12)).toEqual({ items: [], page: 1, pages: 1 });
  });
});
