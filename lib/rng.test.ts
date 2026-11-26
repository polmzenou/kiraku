import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { keyedRng, seededFloat, seededRng } from "./rng";

describe("générateurs à graine (mulberry32)", () => {
  it("flottants dans [0, 1), même suite pour une même graine", () => {
    const a = seededFloat(42);
    const b = seededFloat(42);
    const values = Array.from({ length: 200 }, () => a());
    expect(values).toEqual(Array.from({ length: 200 }, () => b()));
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(seededFloat(43)()).not.toBe(values[0]);
  });

  it("suite connue (les effets du casino rejouent comme avant la mise en commun)", () => {
    const next = seededFloat(1);
    expect(next()).toBeCloseTo(0.6270739405881613, 12);
    expect(next()).toBeCloseTo(0.002735721180215478, 12);
  });

  it("les entiers suivent la même suite que les flottants", () => {
    const floats = seededFloat(7);
    const ints = seededRng(7);
    for (let i = 0; i < 100; i++) expect(ints(1000)).toBe(Math.floor(floats() * 1000));
  });
});

describe("hasard à clé (HMAC-SHA256)", () => {
  const KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
  /** Mot de 32 bits n° i (big-endian) de HMAC-SHA256(clé, message), par node:crypto. */
  const word = (message: string, i: number) => createHmac("sha256", Buffer.from(KEY, "hex")).update(message, "utf8").digest().readUInt32BE(4 * i);

  it("chaque tirage vient d'un mot de HMAC(clé, « label:bloc »), 8 mots par bloc", () => {
    const rng = keyedRng(KEY, "action:5");
    for (let i = 0; i < 20; i++) {
      const expected = Math.floor((word(`action:5:${Math.floor(i / 8)}`, i % 8) / 2 ** 32) * 1000);
      expect(rng(1000)).toBe(expected);
    }
  });

  it("même clé et même label : même suite ; un autre label ou une autre clé : une autre", () => {
    const draw = (key: string, label: string) => {
      const rng = keyedRng(key, label);
      return Array.from({ length: 16 }, () => rng(1_000_000));
    };
    expect(draw(KEY, "action:1")).toEqual(draw(KEY, "action:1"));
    expect(draw(KEY, "action:1")).not.toEqual(draw(KEY, "action:2"));
    expect(draw(KEY, "action:1")).not.toEqual(draw(KEY, "bot:1"));
    expect(draw(KEY, "action:1")).not.toEqual(draw("ff".repeat(32), "action:1"));
  });

  it("entiers dans [0, max)", () => {
    const rng = keyedRng(KEY, "plage");
    for (let i = 0; i < 500; i++) {
      const v = rng(7);
      expect(Number.isInteger(v) && v >= 0 && v < 7).toBe(true);
    }
  });
});
