import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { deleteDeckWith, renameDeckWith, saveDeckWith } from "./deck-core";

const TEAM = ["a", "b", "c"];

function setup({
  exists = true,
  banned = false,
  guest = false,
  decks = 0,
  owned = TEAM,
  updated = 1,
}: { exists?: boolean; banned?: boolean; guest?: boolean; decks?: number; owned?: string[]; updated?: number } = {}) {
  const deck = {
    count: vi.fn().mockResolvedValue(decks),
    create: vi.fn().mockResolvedValue({ id: "new-deck" }),
    updateMany: vi.fn().mockResolvedValue({ count: updated }),
    deleteMany: vi.fn().mockResolvedValue({ count: updated }),
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue(exists ? [{ id: "me", isGuest: guest, bannedAt: banned ? new Date() : null, createdAt: new Date(), coins: 0 }] : []),
    deck,
    userCard: { findMany: vi.fn().mockResolvedValue(owned.map((cardId) => ({ cardId }))) },
  };
  const db = { $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)), deck } as unknown as PrismaClient;
  return { tx, db, deck };
}

const create = { userId: "me", deckId: null, name: "Deck CSM", cardIds: TEAM, maxDecks: 10 };
const edit = { ...create, deckId: "deck-1" };

describe("enregistrement d'un deck", () => {
  it("crée le deck avec les seuls champs attendus", async () => {
    const { db, deck } = setup();
    await expect(saveDeckWith(db, create)).resolves.toEqual({ id: "new-deck" });
    expect(deck.create).toHaveBeenCalledWith({ data: { userId: "me", name: "Deck CSM", cardIds: TEAM }, select: { id: true } });
  });

  it("refuse une création à la limite, sans rien écrire", async () => {
    const { db, deck } = setup({ decks: 10 });
    await expect(saveDeckWith(db, create)).rejects.toMatchObject({ code: "DECK_LIMIT" });
    expect(deck.create).not.toHaveBeenCalled();
  });

  it("une limite baissée n'empêche pas de modifier un deck existant", async () => {
    const { db, deck } = setup({ decks: 12 });
    await expect(saveDeckWith(db, { ...edit, maxDecks: 5 })).resolves.toEqual({ id: "deck-1" });
    expect(deck.count).not.toHaveBeenCalled();
    expect(deck.updateMany).toHaveBeenCalled();
  });

  it.each([
    [["a", "a", "b"]],
    [["a", "b"]],
    [["a", "b", "c", "d"]],
  ])("refuse une équipe invalide : %j", async (cardIds) => {
    const { db, deck } = setup();
    await expect(saveDeckWith(db, { ...create, cardIds })).rejects.toMatchObject({ code: "BAD_TEAM" });
    expect(deck.create).not.toHaveBeenCalled();
  });

  it("refuse une carte non possédée", async () => {
    const { db, deck } = setup({ owned: ["a", "b"] });
    await expect(saveDeckWith(db, create)).rejects.toMatchObject({ code: "NOT_OWNED" });
    expect(deck.create).not.toHaveBeenCalled();
  });

  it("compte les exemplaires de tout statut, même en vente", async () => {
    const { tx, db } = setup();
    await saveDeckWith(db, create);
    expect(tx.userCard.findMany).toHaveBeenCalledWith({
      where: { ownerId: "me", cardId: { in: TEAM } },
      distinct: ["cardId"],
      select: { cardId: true },
    });
  });

  it("ne modifie pas le deck d'un autre joueur", async () => {
    const { db, deck } = setup({ updated: 0 });
    await expect(saveDeckWith(db, edit)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(deck.updateMany).toHaveBeenCalledWith({ where: { id: "deck-1", userId: "me" }, data: { name: "Deck CSM", cardIds: TEAM } });
  });

  it.each([
    { exists: false, code: "NO_USER" },
    { banned: true, code: "BANNED" },
    { guest: true, code: "GUEST" },
  ])("revérifie le joueur sous verrou : $code", async ({ code, ...options }) => {
    const { db, deck } = setup(options);
    await expect(saveDeckWith(db, create)).rejects.toMatchObject({ code });
    expect(deck.create).not.toHaveBeenCalled();
  });
});

describe("renommage et suppression", () => {
  it("renomme un deck indisponible : aucune carte n'est relue", async () => {
    const { tx, db, deck } = setup({ owned: [] });
    await renameDeckWith(db, { userId: "me", deckId: "deck-1", name: "Deck JJK" });
    expect(deck.updateMany).toHaveBeenCalledWith({ where: { id: "deck-1", userId: "me" }, data: { name: "Deck JJK" } });
    expect(tx.userCard.findMany).not.toHaveBeenCalled();
  });

  it("ne renomme pas le deck d'un autre joueur", async () => {
    const { db } = setup({ updated: 0 });
    await expect(renameDeckWith(db, { userId: "me", deckId: "theirs", name: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("supprime dans le périmètre du joueur", async () => {
    const { db, deck } = setup();
    await deleteDeckWith(db, { userId: "me", deckId: "deck-1" });
    expect(deck.deleteMany).toHaveBeenCalledWith({ where: { id: "deck-1", userId: "me" } });
  });

  it("ne supprime pas le deck d'un autre joueur", async () => {
    const { db } = setup({ updated: 0 });
    await expect(deleteDeckWith(db, { userId: "me", deckId: "theirs" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
