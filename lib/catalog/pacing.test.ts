import { describe, expect, it } from "vitest";
import { MAX_ATTEMPTS, nextDelay } from "./pacing";

const base = { attempt: 1, baseDelayMs: 2100 };

describe("cadence AniList", () => {
  it("continue après la pause normale", () => {
    expect(nextDelay({ ...base, status: 200, remaining: "25" })).toEqual({ action: "continue", delayMs: 2100 });
  });

  it("ralentit quand il reste peu de requêtes", () => {
    expect(nextDelay({ ...base, status: 200, remaining: "2" })).toEqual({ action: "continue", delayMs: 8400 });
  });

  it("respecte Retry-After sur un 429, 60 s s'il manque", () => {
    expect(nextDelay({ ...base, status: 429, retryAfter: "30" })).toEqual({ action: "retry", delayMs: 31_000 });
    expect(nextDelay({ ...base, status: 429, retryAfter: null })).toEqual({ action: "retry", delayMs: 61_000 });
  });

  it("backoff exponentiel plafonné sur 5xx et erreur réseau", () => {
    expect(nextDelay({ ...base, status: 502 })).toEqual({ action: "retry", delayMs: 4200 });
    expect(nextDelay({ ...base, status: null, attempt: 3 })).toEqual({ action: "retry", delayMs: 16_800 });
    expect(nextDelay({ ...base, status: 500, attempt: 5 })).toEqual({ action: "retry", delayMs: 60_000 });
  });

  it("abandonne après le nombre maximal d'essais ou sur une erreur de requête", () => {
    expect(nextDelay({ ...base, status: 503, attempt: MAX_ATTEMPTS })).toEqual({ action: "fail" });
    expect(nextDelay({ ...base, status: 429, attempt: MAX_ATTEMPTS })).toEqual({ action: "fail" });
    expect(nextDelay({ ...base, status: 400 })).toEqual({ action: "fail" });
  });
});
