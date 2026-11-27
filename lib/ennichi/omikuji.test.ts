import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { drawOmikuji, foldPool, ticketsHash, unfoldPool, verifyOmikuji } from "./omikuji";

const SEED = "a3".repeat(32);

describe("cagnotte de l'omikuji", () => {
  const pool = [
    { lotId: null, oneOfOne: true, count: 1 },
    { lotId: "divin", oneOfOne: false, count: 2 },
    // Ligne sans lot ni carte 1/1 : elle ne part pas
    { lotId: null, oneOfOne: false, count: 5 },
    { lotId: "myth", oneOfOne: false, count: 3 },
    { lotId: "vide", oneOfOne: false, count: 0 },
  ];

  it("dépliée du plus rare au moins rare, chaque lot avec sa ligne ; une ligne vide ne part pas", () => {
    const prizes = unfoldPool(pool);
    expect(prizes.map((p) => p.line)).toEqual([0, 1, 1, 3, 3, 3]);
    expect(prizes[0]).toEqual({ lotId: null, oneOfOne: true, line: 0 });
    expect(prizes[3]).toEqual({ lotId: "myth", oneOfOne: false, line: 3 });
    expect(unfoldPool([{ lotId: "x", oneOfOne: false, count: -2 }])).toEqual([]);
  });

  it("repliée après le tirage : les lignes figées avec leur nombre de lots", () => {
    expect(foldPool(unfoldPool(pool))).toEqual([
      { line: 0, lotId: null, oneOfOne: true, count: 1 },
      { line: 1, lotId: "divin", oneOfOne: false, count: 2 },
      { line: 3, lotId: "myth", oneOfOne: false, count: 3 },
    ]);
    expect(foldPool([])).toEqual([]);
  });
});

describe("omikuji de l'Ennichi", () => {
  it("un lot par ticket au plus, du plus rare au moins rare, et le reste non distribué", async () => {
    const prizes = unfoldPool([
      { lotId: null, oneOfOne: true, count: 1 },
      { lotId: "divin", oneOfOne: false, count: 20 },
      { lotId: "myth", oneOfOne: false, count: 55 },
    ]);
    expect(prizes).toHaveLength(76);
    expect(prizes.slice(0, 2).map((p) => p.line)).toEqual([0, 1]);
    // 10 tickets : seuls les 10 premiers lots partent (la 1/1, puis 9 Divins)
    const draws = await drawOmikuji(SEED, 10, prizes.length);
    expect(draws.map((d) => d.prize)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(new Set(draws.map((d) => d.ticket)).size).toBe(10);
    expect(draws.map((d) => d.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // Plus de tickets que de lots : toute la cagnotte part, chaque gagnant une fois
    const many = await drawOmikuji(SEED, 200, prizes.length);
    expect(many).toHaveLength(76);
    expect(new Set(many.map((d) => d.ticket)).size).toBe(76);
    expect(await drawOmikuji(SEED, 0, prizes.length)).toEqual([]);
  });

  it("le même tirage se refait à l'identique, et change avec la graine", async () => {
    const a = await drawOmikuji(SEED, 50, 30);
    expect(await drawOmikuji(SEED, 50, 30)).toEqual(a);
    expect(await drawOmikuji("b4".repeat(32), 50, 30)).not.toEqual(a);
  });

  it("chaque ticket a sa chance (répartition à peu près uniforme)", async () => {
    const wins = [0, 0, 0, 0];
    for (let i = 0; i < 400; i++) {
      const [d] = await drawOmikuji(randomBytes(32).toString("hex"), 4, 1);
      wins[d.ticket]++;
    }
    for (const w of wins) expect(w).toBeGreaterThan(60);
    // 400 tirages par WebCrypto : ~5 s quand toute la suite tourne en parallèle, au-delà des 5 s par défaut
  }, 30_000);

  it("vérification : empreintes et tirage refaits, falsification repérée", async () => {
    const tickets = ["1 · Léa", "2 · Hugo", "3 · Léa", "4 · Yuki"];
    const seedHash = createHash("sha256").update(Buffer.from(SEED, "hex")).digest("hex");
    const tHash = await ticketsHash(tickets);
    expect(tHash).toBe(createHash("sha256").update(tickets.join("\n")).digest("hex"));
    const draws = await drawOmikuji(SEED, tickets.length, 3);
    const ok = await verifyOmikuji({ seed: SEED, seedHash, tickets, ticketsHash: tHash, prizeCount: 3, draws });
    expect(ok).toMatchObject({ commitOk: true, ticketsOk: true, drawsOk: true });
    const swapped = draws.map((d, i) => (i === 0 ? { ...d, ticket: (d.ticket + 1) % tickets.length } : d));
    expect((await verifyOmikuji({ seed: SEED, seedHash, tickets, ticketsHash: tHash, prizeCount: 3, draws: swapped }))?.drawsOk).toBe(false);
    expect((await verifyOmikuji({ seed: SEED, seedHash, tickets: [...tickets, "5 · Max"], ticketsHash: tHash, prizeCount: 3, draws }))?.ticketsOk).toBe(false);
    expect(await verifyOmikuji({ seed: "pas une graine", seedHash, tickets, ticketsHash: tHash, prizeCount: 3, draws })).toBeNull();
  });
});
