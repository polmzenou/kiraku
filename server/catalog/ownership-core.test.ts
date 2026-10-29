import type { PrismaClient } from "@/generated/prisma/client";
import { describe, expect, it, vi } from "vitest";
import { readWikiCards, readWikiCollection } from "./ownership-core";

describe("lecture groupée privée du wiki", () => {
  it("fait une seule requête paramétrée pour les exemplaires et les découvertes", async () => {
    const query = vi.fn().mockResolvedValue([
      { anilistId: 60, copies: 4, discovered: true },
      { anilistId: 2, copies: 0, discovered: true },
    ]);
    const db = { $queryRaw: query } as unknown as Pick<PrismaClient, "$queryRaw">;
    const result = await readWikiCollection(db, "viewer-a");
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0].slice(1)).toEqual(["viewer-a", "viewer-a"]);
    const sql = (query.mock.calls[0][0] as TemplateStringsArray).join("?");
    expect(sql).toContain('FROM "UserCard"');
    expect(sql).toContain('FROM "Discovery"');
    expect(sql).not.toContain("status =");
    expect(result.hasCards).toBe(true);
    expect(result.cards.get(60)).toEqual({ copies: 4, discovered: true });
    expect(result.cards.get(2)).toEqual({ copies: 0, discovered: true });
  });

  it("lit seulement les cartes demandées pour une fiche, sans requête quand il n'y en a aucune", async () => {
    const query = vi.fn().mockResolvedValue([{ anilistId: 60, copies: 2, discovered: true }]);
    const db = { $queryRaw: query } as unknown as Pick<PrismaClient, "$queryRaw">;
    const result = await readWikiCards(db, "viewer-a", [60, 61]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0].slice(1)).toEqual([[60, 61], "viewer-a", "viewer-a"]);
    expect((query.mock.calls[0][0] as TemplateStringsArray).join("?")).toContain('"publicId" = ANY(');
    expect(result.cards.get(60)).toEqual({ copies: 2, discovered: true });
    expect((await readWikiCards(db, "viewer-a", [])).cards.size).toBe(0);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("isole deux joueurs et conserve l'historique d'une collection vide", async () => {
    const query = vi.fn().mockResolvedValueOnce([{ anilistId: 60, copies: 1, discovered: true }])
      .mockResolvedValueOnce([{ anilistId: 2, copies: 0, discovered: true }]);
    const db = { $queryRaw: query } as unknown as Pick<PrismaClient, "$queryRaw">;
    const first = await readWikiCollection(db, "viewer-a");
    const second = await readWikiCollection(db, "viewer-b");
    expect(first.cards.has(2)).toBe(false);
    expect(second.cards.has(60)).toBe(false);
    expect(second.hasCards).toBe(false);
    expect(second.cards.get(2)?.discovered).toBe(true);
    expect(query.mock.calls[1].slice(1)).toEqual(["viewer-b", "viewer-b"]);
  });
});
