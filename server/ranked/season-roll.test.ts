import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import type { RankedRules } from "@/lib/ranked/rules";

vi.mock("server-only", () => ({}));

import { rollSeasonWith } from "./ranked-core";

// La clôture de saison est appelée à chaque vue de /combat et /classement : tant que la saison court,
// elle ne doit ouvrir ni transaction ni verrou.
const NOW = new Date("2026-10-29T12:00:00Z");
const season = (endsAt: string) => ({ id: "s1", number: 3, startsAt: new Date("2026-10-01T00:00:00Z"), endsAt: new Date(endsAt) });

function fakeDb(open: ReturnType<typeof season>) {
  const $transaction = vi.fn(async () => ({ closed: open, results: 0 }));
  const db = { season: { findFirst: vi.fn(async () => open) }, $transaction } as unknown as PrismaClient;
  return { db, $transaction };
}
const rules = {} as RankedRules;

describe("rollSeasonWith", () => {
  it("ne prend aucun verrou tant que la saison court", async () => {
    const { db, $transaction } = fakeDb(season("2026-11-01T00:00:00Z"));
    await expect(rollSeasonWith(db, NOW, rules, "Europe/Paris")).resolves.toEqual({ closed: null, results: 0 });
    expect($transaction).not.toHaveBeenCalled();
  });

  it("clôt sous verrou une fois l'échéance passée", async () => {
    const { db, $transaction } = fakeDb(season("2026-10-29T11:59:59Z"));
    await rollSeasonWith(db, NOW, rules, "Europe/Paris");
    expect($transaction).toHaveBeenCalledOnce();
  });

  it("la clôture anticipée de l'admin passe outre l'échéance", async () => {
    const { db, $transaction } = fakeDb(season("2026-11-01T00:00:00Z"));
    await rollSeasonWith(db, NOW, rules, "Europe/Paris", { force: true });
    expect($transaction).toHaveBeenCalledOnce();
  });
});
