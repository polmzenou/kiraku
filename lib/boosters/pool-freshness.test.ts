import { describe, expect, it } from "vitest";
import { isPoolStale } from "./pool-freshness";

const TZ = "Europe/Paris";
const NOW = new Date("2026-10-26T10:00:00Z");
const CATALOG = new Date("2026-10-20T08:00:00Z").getTime();
const at = (iso: string) => new Date(iso);

describe("isPoolStale", () => {
  it("refait un pool jamais calculé", () => {
    expect(isPoolStale({ poolComputedAt: null, updatedAt: at("2026-10-01T00:00:00Z"), dynamic: false }, CATALOG, NOW, TZ)).toBe(true);
  });

  it("garde un pool calculé après le catalogue et le type", () => {
    const t = at("2026-10-25T12:00:00Z");
    expect(isPoolStale({ poolComputedAt: t, updatedAt: t, dynamic: false }, CATALOG, NOW, TZ)).toBe(false);
  });

  it("refait un pool plus ancien que la version du catalogue", () => {
    const t = at("2026-10-19T12:00:00Z");
    expect(isPoolStale({ poolComputedAt: t, updatedAt: t, dynamic: false }, CATALOG, NOW, TZ)).toBe(true);
  });

  it("refait un pool plus ancien que la dernière modification du type", () => {
    expect(isPoolStale({ poolComputedAt: at("2026-10-25T12:00:00Z"), updatedAt: at("2026-10-25T12:00:01Z"), dynamic: false }, CATALOG, NOW, TZ)).toBe(true);
  });

  it("refait un pool du jour calculé la veille, dans le fuseau du jeu", () => {
    // 25/10 23 h 30 à Paris : la veille du 26/10, même si c'est déjà le 26 dans d'autres fuseaux.
    const t = at("2026-10-25T22:30:00Z");
    expect(isPoolStale({ poolComputedAt: t, updatedAt: t, dynamic: true }, CATALOG, NOW, TZ)).toBe(true);
    const today = at("2026-10-25T23:30:00Z"); // 26/10 0 h 30 à Paris
    expect(isPoolStale({ poolComputedAt: today, updatedAt: today, dynamic: true }, CATALOG, NOW, TZ)).toBe(false);
  });

  it("garde un pool statique calculé un autre jour", () => {
    const t = at("2026-10-21T12:00:00Z");
    expect(isPoolStale({ poolComputedAt: t, updatedAt: t, dynamic: false }, CATALOG, NOW, TZ)).toBe(false);
  });
});
