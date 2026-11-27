import { describe, expect, it, vi } from "vitest";
import { minuteMemo } from "./view-memo";

describe("vue de la fête gardée pour la minute en cours", () => {
  it("calcule une fois par langue et par minute, avec l'heure du début de la minute", async () => {
    const load = vi.fn(async (locale: string, at: number) => `${locale}@${at}`);
    const view = minuteMemo(load);
    expect(await view("fr", 120_000)).toBe("fr@120000");
    expect(await view("fr", 179_999)).toBe("fr@120000");
    expect(await view("en", 150_000)).toBe("en@120000");
    expect(load).toHaveBeenCalledTimes(2);
    expect(await view("fr", 180_000)).toBe("fr@180000");
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("deux rendus simultanés partagent le calcul ; une autre version fait relire tout de suite", async () => {
    let lit = 1;
    const load = vi.fn(async () => lit);
    const view = minuteMemo(load);
    expect(await Promise.all([view("fr", 0), view("fr", 1)])).toEqual([1, 1]);
    expect(load).toHaveBeenCalledTimes(1);
    lit = 2;
    expect(await view("fr", 2)).toBe(1);
    expect(await view("fr", 3, 1)).toBe(2);
    expect(await view("fr", 4, 1)).toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("un échec n'est pas gardé", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("base")).mockResolvedValue("ok");
    const view = minuteMemo(load);
    await expect(view("fr", 0)).rejects.toThrow("base");
    expect(await view("fr", 1)).toBe("ok");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
