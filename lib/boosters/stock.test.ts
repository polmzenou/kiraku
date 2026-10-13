import { describe, expect, it } from "vitest";
import { computeStock, consumeStock } from "./stock";

const MIN = 60_000;
const rules = { max: 10, intervalMs: 10 * MIN };
const t0 = new Date("2026-10-13T12:00:00Z");
const at = (ms: number) => new Date(t0.getTime() + ms);

describe("computeStock", () => {
  it("ne donne rien avant 10 minutes pile", () => {
    const s = computeStock(3, t0, at(10 * MIN - 1000), rules);
    expect(s.stock).toBe(3);
    expect(s.anchor).toEqual(t0);
    expect(s.nextAt).toEqual(at(10 * MIN));
  });

  it("donne un booster à 10 minutes pile", () => {
    const s = computeStock(3, t0, at(10 * MIN), rules);
    expect(s.stock).toBe(4);
    expect(s.nextAt).toEqual(at(20 * MIN));
  });

  it("garde les minutes déjà entamées", () => {
    const s = computeStock(3, t0, at(27 * MIN), rules);
    expect(s.stock).toBe(5);
    expect(s.anchor).toEqual(at(20 * MIN));
    expect(s.nextAt).toEqual(at(30 * MIN));
  });

  it("plafonne au max et arrête le chrono", () => {
    const s = computeStock(8, t0, at(5 * 60 * MIN), rules);
    expect(s).toEqual({ stock: 10, anchor: at(5 * 60 * MIN), nextAt: null });
  });

  it("garde un stock au-dessus du max sans le recharger", () => {
    const s = computeStock(14, t0, at(60 * MIN), rules);
    expect(s).toEqual({ stock: 14, anchor: at(60 * MIN), nextAt: null });
  });

  it("ne donne rien si l'ancre est dans le futur", () => {
    const s = computeStock(2, at(30 * MIN), t0, rules);
    expect(s.stock).toBe(2);
    expect(s.nextAt).toEqual(at(10 * MIN));
  });

  it("applique un nouveau délai à l'ancre existante", () => {
    const s = computeStock(0, t0, at(12 * MIN), { max: 10, intervalMs: 5 * MIN });
    expect(s.stock).toBe(2);
    expect(s.nextAt).toEqual(at(15 * MIN));
  });
});

describe("consumeStock", () => {
  it("ouvrir depuis un stock plein démarre le chrono maintenant", () => {
    const now = at(3 * 60 * MIN);
    const after = consumeStock(computeStock(10, t0, now, rules), 1, rules);
    expect(after).toEqual({ stock: 9, anchor: now, nextAt: new Date(now.getTime() + 10 * MIN) });
  });

  it("ouvrir sous le max ne touche pas au chrono", () => {
    const s = computeStock(5, t0, at(4 * MIN), rules);
    const after = consumeStock(s, 2, rules);
    expect(after.stock).toBe(3);
    expect(after.anchor).toEqual(t0);
    expect(after.nextAt).toEqual(at(10 * MIN));
  });

  it("ouvre plusieurs boosters d'un coup", () => {
    const after = consumeStock(computeStock(10, t0, t0, rules), 10, rules);
    expect(after.stock).toBe(0);
  });

  it("refuse d'ouvrir plus que le stock", () => {
    const s = computeStock(4, t0, at(MIN), rules);
    expect(() => consumeStock(s, 5, rules)).toThrow("NO_BOOSTER");
    expect(() => consumeStock(s, 0, rules)).toThrow("NO_BOOSTER");
  });

  it("enchaîne recharge et ouverture sans perdre de temps", () => {
    // 10 → 9 à t0, puis on attend 25 min : 2 boosters gagnés, 5 min entamées conservées
    const opened = consumeStock(computeStock(10, t0, t0, rules), 1, rules);
    const later = computeStock(opened.stock, opened.anchor, at(25 * MIN), rules);
    expect(later.stock).toBe(10);
    const s = computeStock(3, opened.anchor, at(25 * MIN), rules);
    expect(s.stock).toBe(5);
    expect(s.nextAt).toEqual(at(30 * MIN));
  });
});
