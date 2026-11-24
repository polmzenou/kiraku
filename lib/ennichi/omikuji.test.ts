import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { drawOmikuji, ticketsHash, unfoldPrizes, verifyOmikuji } from "./omikuji";

const SEED = "a3".repeat(32);

describe("omikuji de l'Ennichi", () => {
  it("un lot par ticket au plus, du plus rare au moins rare, et le reste non distribué", async () => {
    const prizes = unfoldPrizes([{ count: 1 }, { count: 20 }, { count: 55 }]);
    expect(prizes).toHaveLength(76);
    expect(prizes.slice(0, 2)).toEqual([0, 1]);
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
  });

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
