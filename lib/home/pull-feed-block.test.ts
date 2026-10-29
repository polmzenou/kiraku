import { describe, expect, it } from "vitest";
import { isPermanentBlock, isPullFeedBlocked, PERMANENT_BLOCK, pullFeedBlockUntil } from "./pull-feed-block";

describe("blacklist des gros tirages", () => {
  const now = new Date("2026-10-29T10:00:00Z");

  it("retire pour 1, 7 ou 30 jours à partir de maintenant", () => {
    expect(pullFeedBlockUntil("1d", now)).toEqual(new Date("2026-10-30T10:00:00Z"));
    expect(pullFeedBlockUntil("7d", now)).toEqual(new Date("2026-11-05T10:00:00Z"));
    expect(pullFeedBlockUntil("30d", now)).toEqual(new Date("2026-11-28T10:00:00Z"));
  });

  it("retrait définitif : date sentinelle reconnue comme telle", () => {
    expect(pullFeedBlockUntil("permanent", now)).toEqual(PERMANENT_BLOCK);
    expect(isPermanentBlock(PERMANENT_BLOCK)).toBe(true);
    expect(isPermanentBlock(pullFeedBlockUntil("30d", now))).toBe(false);
  });

  it("un retrait expiré ne bloque plus", () => {
    expect(isPullFeedBlocked(null, now)).toBe(false);
    expect(isPullFeedBlocked(new Date("2026-10-29T09:59:59Z"), now)).toBe(false);
    expect(isPullFeedBlocked(PERMANENT_BLOCK, now)).toBe(true);
  });
});
