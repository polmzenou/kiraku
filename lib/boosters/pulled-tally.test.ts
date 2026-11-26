import { describe, expect, it, vi } from "vitest";
import { pulledTally, type PulledLoaders } from "./pulled-tally";

const HOUR = 3_600_000;
const T0 = new Date("2026-11-26T12:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

/** Historique factice : cartes tirées par date d'ouverture, sommées comme en base. */
function fakeDb(openings: { at: Date; cards: number }[]) {
  const sum = (keep: (d: Date) => boolean) => openings.filter((o) => keep(o.at)).reduce((s, o) => s + o.cards, 0);
  const loaders: PulledLoaders = {
    split: vi.fn(async (_u: string, cutoff: Date) => ({ before: sum((d) => d < cutoff), since: sum((d) => d >= cutoff) })),
    since: vi.fn(async (_u: string, cutoff: Date) => sum((d) => d >= cutoff)),
  };
  return { openings, loaders };
}

describe("cartes tirées en cache (Encens)", () => {
  it("lit tout l'historique une fois, puis seulement la fin, et reste exact après une ouverture", async () => {
    const db = fakeDb([{ at: at(-48 * HOUR), cards: 40 }, { at: at(-10 * 60_000), cards: 5 }]);
    const pulled = pulledTally(db.loaders, { marginMs: HOUR, refreshMs: 24 * HOUR, maxEntries: 10 });
    expect(await pulled("u1", T0)).toBe(45);
    db.openings.push({ at: at(60_000), cards: 5 });
    expect(await pulled("u1", at(2 * 60_000))).toBe(50);
    expect(db.loaders.split).toHaveBeenCalledTimes(1);
    expect(db.loaders.since).toHaveBeenCalledTimes(1);
  });

  it("une ouverture encore en cours au premier calcul, datée avant lui, est comptée à la vue suivante", async () => {
    const db = fakeDb([{ at: at(-48 * HOUR), cards: 40 }]);
    const pulled = pulledTally(db.loaders, { marginMs: HOUR, refreshMs: 24 * HOUR, maxEntries: 10 });
    expect(await pulled("u1", T0)).toBe(40);
    // Transaction commencée 10 s avant le calcul, validée juste après : sa date reste après la coupure
    db.openings.push({ at: at(-10_000), cards: 5 });
    expect(await pulled("u1", at(1_000))).toBe(45);
  });

  it("recalcule la somme d'avant quand la coupure vieillit, et oublie le joueur le plus ancien", async () => {
    const db = fakeDb([{ at: at(-48 * HOUR), cards: 40 }]);
    const pulled = pulledTally(db.loaders, { marginMs: HOUR, refreshMs: 24 * HOUR, maxEntries: 1 });
    await pulled("u1", T0);
    await pulled("u1", at(24 * HOUR));
    expect(db.loaders.split).toHaveBeenCalledTimes(2);
    await pulled("u2", at(24 * HOUR));
    await pulled("u1", at(24 * HOUR + 1));
    expect(db.loaders.split).toHaveBeenCalledTimes(4);
  });
});
