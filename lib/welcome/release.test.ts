import { describe, expect, it } from "vitest";
import { needsReleaseWelcome } from "./release";

const releasedAt = new Date("2026-10-20T18:45:00Z");

describe("présentation de la dernière version", () => {
  it("s'affiche pour un compte qui n'a jamais vu de présentation", () => {
    expect(needsReleaseWelcome(null, releasedAt)).toBe(true);
  });

  it("s'affiche une fois pour un compte qui n'a vu que l'ancienne présentation", () => {
    expect(needsReleaseWelcome(new Date("2026-09-01T10:00:00Z"), releasedAt)).toBe(true);
  });

  it("ne revient pas une fois la nouvelle présentation vue", () => {
    expect(needsReleaseWelcome(releasedAt, releasedAt)).toBe(false);
    expect(needsReleaseWelcome(new Date("2026-10-21T08:00:00Z"), releasedAt)).toBe(false);
  });
});
