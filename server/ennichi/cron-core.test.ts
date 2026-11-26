import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { ennichiSchedule, type EnnichiPhase, type EnnichiRules } from "@/lib/ennichi/rules";
import { EnnichiCloseError } from "./close-core";
import { runEnnichiCronWith, type EnnichiCronInput, type EnnichiCronOps } from "./cron-core";

// Passage du cron de l'Ennichi avec des doubles (client, horloge, opérations) : qui fait quoi selon la phase, borne
// des lanternes à la clôture, tirage de secours, versements après le tirage, étapes isolées, limite de temps.

const DAY = 86_400_000;
const START = new Date("2026-12-01T18:00:00.000Z");
const RULES: EnnichiRules = {
  enabled: true,
  edition: 1,
  startsAt: START,
  days: 14,
  closingDays: 3,
  stepMultiplier: 2,
  liftCap: true,
  tiers: [
    { lanterns: 25, lotId: "t0", choiceVouchers: 0 },
    { lanterns: 50, lotId: "t1", choiceVouchers: 0 },
    { lanterns: 200, lotId: "t2", choiceVouchers: 0 },
    { lanterns: 500, lotId: "t3", choiceVouchers: 1 },
  ],
  ranks: [{ from: 1, to: 1, title: "yokozuna", lotId: "r1", choiceVouchers: 0, oneOfOne: false }],
  omikuji: [{ lotId: "o1", oneOfOne: false, count: 3 }],
  tierGrantsPerIp: 3,
  excludeStaff: false,
};
const SCHEDULE = ennichiSchedule(RULES)!;
const at = (days: number) => new Date(START.getTime() + days * DAY);

/** Client double : seuls les paliers atteints sont lus directement (le reste passe par les opérations). */
function fakeDb(tiers: number[]) {
  const findMany = vi.fn(async (args: { where: { finishedAt?: null } }) => tiers.map((tier) => ({ tier, finished: args.where.finishedAt })));
  return { db: { ennichiTierReached: { findMany } } as unknown as PrismaClient, findMany };
}

function fakeOps(over: Partial<{ [K in keyof EnnichiCronOps]: (...args: Parameters<EnnichiCronOps[K]>) => unknown }> = {}) {
  return {
    lanternCounts: vi.fn(over.lanternCounts ?? (async () => ({ placed: 60, lit: 55 }))),
    recordReachedTiers: vi.fn(over.recordReachedTiers ?? (async () => [1])),
    sendTier: vi.fn(over.sendTier ?? (async () => ({ granted: 2, done: true }))),
    draw: vi.fn(over.draw ?? (async () => ({ ranked: 1, tickets: 3, draws: 3, awards: 4 }))),
    payAwards: vi.fn(over.payAwards ?? (async () => ({ paid: 4, skipped: 0 }))),
  };
}

const secrets = vi.fn(async () => ({ seedKey: new Uint8Array(32), titleText: () => ({ label: { fr: "", en: "" }, hint: { fr: "", en: "" } }) }));

function input(phase: EnnichiPhase, now: Date, clock: () => number = () => 0): EnnichiCronInput {
  return {
    state: { rules: RULES, schedule: SCHEDULE, phase },
    now,
    clock,
    budgetMs: 50_000,
    pay: { lotDeps: { rng: () => 0, loadPool: async () => ({ COMMON: [], UNCOMMON: [], RARE: [], EPIC: [], LEGENDARY: [], MYTHIC: [] }) }, now },
    secrets,
  };
}

const run = (phase: EnnichiPhase, now: Date, ops: ReturnType<typeof fakeOps>, tiers = [0, 1], clock?: () => number) => {
  const { db, findMany } = fakeDb(tiers);
  return runEnnichiCronWith(db, input(phase, now, clock), ops as unknown as EnnichiCronOps).then((result) => ({ result, findMany }));
};

describe("cron de l'Ennichi", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    secrets.mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  it("fête coupée ou annoncée : rien", async () => {
    for (const phase of ["off", "before"] as const) {
      const ops = fakeOps();
      const { result, findMany } = await run(phase, at(-1), ops);
      expect(result).toMatchObject({ phase, lit: 0, granted: 0, drawn: false, paid: 0, errors: [] });
      expect(findMany).not.toHaveBeenCalled();
      for (const op of Object.values(ops)) expect(op).not.toHaveBeenCalled();
    }
  });

  it("pendant la fête : lanternes comptées à l'instant, paliers figés, chaque palier atteint rejoué ; ni tirage ni prix", async () => {
    const ops = fakeOps();
    const now = at(3);
    const { result, findMany } = await run("live", now, ops);
    expect(ops.lanternCounts).toHaveBeenCalledWith(expect.anything(), 1, now);
    expect(ops.recordReachedTiers).toHaveBeenCalledWith(expect.anything(), RULES, 55, now);
    // Tous les paliers atteints, même ceux dont l'envoi est fini (un joueur devenu éligible ensuite est servi)
    expect(findMany.mock.calls[0][0].where).toEqual({ edition: 1 });
    expect(ops.sendTier.mock.calls.map((c) => c[1].tier)).toEqual([0, 1]);
    expect(ops.sendTier.mock.calls[0][1]).toMatchObject({ edition: 1, schedule: SCHEDULE, perIp: 3 });
    expect(result).toMatchObject({ lit: 55, reached: [1], granted: 4, drawn: false, paid: 0, errors: [] });
    expect(ops.draw).not.toHaveBeenCalled();
    expect(ops.payAwards).not.toHaveBeenCalled();
  });

  it("clôture avant la date : lanternes encore comptées, pas de tirage de secours", async () => {
    const ops = fakeOps();
    const now = at(15);
    await run("closing", now, ops);
    expect(ops.lanternCounts).toHaveBeenCalledWith(expect.anything(), 1, now);
    expect(ops.draw).not.toHaveBeenCalled();
    expect(secrets).not.toHaveBeenCalled();
  });

  it("date de clôture passée sans tirage : lanternes bornées à la clôture, tirage de secours puis prix versés", async () => {
    const ops = fakeOps();
    const now = at(17.1);
    const { result } = await run("closing", now, ops);
    // Une installation après la clôture annoncée n'allume plus rien
    expect(ops.lanternCounts).toHaveBeenCalledWith(expect.anything(), 1, SCHEDULE.closesAt);
    expect(ops.draw).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ staffId: null, rules: RULES, now, seedKey: expect.any(Uint8Array) }));
    expect(ops.payAwards).toHaveBeenCalledWith(expect.anything(), 1, expect.objectContaining({ deadline: 50_000 }));
    expect(result).toMatchObject({ drawn: true, paid: 4, errors: [] });
  });

  it("tirage déjà fait par l'équipe entre-temps : pas une erreur, et rien n'est versé à ce passage", async () => {
    const ops = fakeOps({
      draw: async () => {
        throw new EnnichiCloseError("ALREADY_DRAWN");
      },
    });
    const { result } = await run("closing", at(17.5), ops);
    expect(result).toMatchObject({ drawn: false, paid: 0, errors: [] });
    expect(ops.payAwards).not.toHaveBeenCalled();
  });

  it("après le tirage : plus de lanternes, seulement les envois pas finis, puis les prix", async () => {
    const ops = fakeOps();
    const { result, findMany } = await run("closed", at(18), ops, [2]);
    expect(ops.lanternCounts).not.toHaveBeenCalled();
    expect(ops.recordReachedTiers).not.toHaveBeenCalled();
    expect(findMany.mock.calls[0][0].where).toEqual({ edition: 1, finishedAt: null });
    expect(ops.sendTier.mock.calls.map((c) => c[1].tier)).toEqual([2]);
    expect(ops.draw).not.toHaveBeenCalled();
    expect(result).toMatchObject({ granted: 2, paid: 4, errors: [] });
  });

  it("une étape qui échoue n'empêche pas les suivantes", async () => {
    const ops = fakeOps({
      sendTier: async () => {
        throw new Error("lot supprimé");
      },
      draw: async () => {
        throw new Error("panne");
      },
    });
    const { result } = await run("closing", at(17.2), ops);
    expect(result.errors).toEqual(["tiers", "draw"]);
    // Le tirage n'a pas eu lieu : pas de prix à ce passage
    expect(ops.payAwards).not.toHaveBeenCalled();

    const pay = fakeOps({
      payAwards: async () => {
        throw new Error("panne");
      },
    });
    expect((await run("closed", at(18), pay)).result.errors).toEqual(["awards"]);
  });

  it("temps écoulé : le passage s'arrête avant les envois, le tirage et les prix", async () => {
    const ops = fakeOps();
    let t = 0;
    // Chaque lecture de l'horloge avance de 30 secondes : la limite (50 s) tombe après le premier palier
    const { result } = await run("closing", at(17.2), ops, [0, 1, 2], () => (t += 30_000) - 30_000);
    expect(ops.sendTier).toHaveBeenCalledTimes(1);
    expect(ops.draw).not.toHaveBeenCalled();
    expect(ops.payAwards).not.toHaveBeenCalled();
    expect(result.errors).toEqual([]);
  });
});
