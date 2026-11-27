import { describe, expect, it, vi } from "vitest";
import { missionDotCache } from "./mission-dot";

describe("pastille des missions en mémoire", () => {
  const opts = { ttlMs: 30_000, maxEntries: 2 };

  it("calcule une fois par joueur pendant la durée de vie, puis recalcule", async () => {
    const load = vi.fn(async (id: string) => id === "a");
    const dots = missionDotCache(load, opts);
    expect(await dots.get("a", 0)).toBe(true);
    expect(await dots.get("a", 29_999)).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    expect(await dots.get("b", 10)).toBe(false);
    expect(await dots.get("a", 30_000)).toBe(true);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("une réclamation efface l'entrée du joueur, et deux rendus simultanés partagent le calcul", async () => {
    let claimable = true;
    const load = vi.fn(async () => claimable);
    const dots = missionDotCache(load, opts);
    const [first, second] = await Promise.all([dots.get("a", 0), dots.get("a", 1)]);
    expect([first, second]).toEqual([true, true]);
    expect(load).toHaveBeenCalledTimes(1);
    claimable = false;
    dots.forget("a");
    expect(await dots.get("a", 2)).toBe(false);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("ne garde pas un échec et borne le nombre de joueurs", async () => {
    const load = vi.fn(async (id: string) => {
      if (id === "boom") throw new Error("base");
      return true;
    });
    const dots = missionDotCache(load, opts);
    await expect(dots.get("boom", 0)).rejects.toThrow("base");
    await expect(dots.get("boom", 1)).rejects.toThrow("base");
    expect(load).toHaveBeenCalledTimes(2);
    await dots.get("a", 0);
    await dots.get("b", 0);
    await dots.get("c", 0);
    // « a », le plus ancien, est sorti : recalculé
    await dots.get("a", 1);
    expect(load.mock.calls.filter(([id]) => id === "a")).toHaveLength(2);
  });
});
