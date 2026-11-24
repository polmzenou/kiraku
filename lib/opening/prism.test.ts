import { describe, expect, it } from "vitest";
import { hasPrism, HOLO, PRISM, PRISM_SPECTRUM, prismShake, prismSparks, XR_ECHOES } from "./prism";

describe("prisme de la XR", () => {
  it("ne s'allume que si le tirage cache une XR", () => {
    expect(hasPrism([{ rarity: "COMMON" }, { rarity: "XR" }])).toBe(true);
    expect(hasPrism([{ rarity: "MYTHIC" }, { rarity: "SR" }, { rarity: "GOLD" }])).toBe(false);
    expect(hasPrism([])).toBe(false);
  });

  it("garde la palette holographique de la révélation XR", () => {
    expect(HOLO.slice(0, 3)).toEqual([...XR_ECHOES]);
    expect(new Set(PRISM_SPECTRUM).size).toBe(PRISM_SPECTRUM.length);
  });

  it("lance une gerbe stable, plus légère en effets allégés, en deux salves autour du pop", () => {
    const full = prismSparks(false), lite = prismSparks(true);
    expect(full).toHaveLength(24);
    expect(lite).toHaveLength(10);
    expect(prismSparks(false)).toEqual(full);
    for (const s of full) {
      expect(s.left).toBeGreaterThanOrEqual(8);
      expect(s.left).toBeLessThanOrEqual(92);
      expect(s.dy).toBeLessThan(0);
      expect(PRISM_SPECTRUM).toContain(s.color);
    }
    // Seconde salve : elle part autour du pop du tremblement
    const late = full.filter((s) => s.delay >= 900);
    expect(late.length).toBe(12);
    for (const s of late) expect(Math.abs(s.delay - PRISM.popMs)).toBeLessThan(400);
  });

  it("tremble de plus en plus fort, revient au repos et finit par un pop", () => {
    const shake = prismShake(false);
    expect(shake.x[0]).toBe(0);
    expect(shake.x.at(-1)).toBe(0);
    expect(shake.rotate.at(-1)).toBe(0);
    const amplitudes = shake.x.slice(1, -1).map(Math.abs);
    for (let i = 1; i < amplitudes.length; i++) expect(amplitudes[i]).toBeGreaterThanOrEqual(amplitudes[i - 1]);
    expect(Math.max(...amplitudes)).toBe(8);
    expect(Math.max(...shake.rotate.map(Math.abs))).toBe(2.5);
    expect(Math.max(...shake.scale)).toBeGreaterThan(1.04);
    expect(shake.scale.at(-1)).toBe(1);
    expect(shake.duration * 1000).toBe(PRISM.shakeMs);
  });

  it("tremble moins fort et moins longtemps en effets allégés", () => {
    const lite = prismShake(true), full = prismShake(false);
    expect(Math.max(...lite.x.map(Math.abs))).toBeLessThan(Math.max(...full.x.map(Math.abs)));
    expect(lite.duration).toBeLessThan(full.duration);
  });

  it("laisse le pop se jouer pendant le tremblement, avant la sortie des cartes", () => {
    expect(PRISM.popMs).toBeLessThan(PRISM.shakeMs);
    expect(PRISM.holdMs).toBeGreaterThan(0);
  });
});
