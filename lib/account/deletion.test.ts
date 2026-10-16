import { describe, expect, it } from "vitest";
import { USERNAME_REGEX } from "../username";
import { anonymizedUsername, confirmsUsername, deletionDueAt, isFrozen } from "./deletion";

describe("suppression du compte", () => {
  it("pseudo anonymisé valide et sans lien avec l'ancien", () => {
    const name = anonymizedUsername(new Uint8Array([0, 1, 2, 3, 250, 251, 252, 253]));
    expect(name).toMatch(/^supprime-[a-z2-9]{8}$/);
    expect(USERNAME_REGEX.test(name)).toBe(true);
  });

  it("échéance à J + délai", () => {
    expect(deletionDueAt(new Date("2026-10-16T10:00:00Z"), 30).toISOString()).toBe("2026-11-15T10:00:00.000Z");
    expect(deletionDueAt(new Date("2026-10-16T10:00:00Z"), 0).toISOString()).toBe("2026-10-16T10:00:00.000Z");
  });

  it("gel du compte", () => {
    expect(isFrozen({ deletionRequestedAt: null, anonymizedAt: null })).toBe(false);
    expect(isFrozen({ deletionRequestedAt: new Date() })).toBe(true);
    expect(isFrozen({ deletionRequestedAt: null, anonymizedAt: new Date() })).toBe(true);
  });

  it("confirmation par le pseudo", () => {
    expect(confirmsUsername("  kaito ", "Kaito")).toBe(true);
    expect(confirmsUsername("Kait0", "Kaito")).toBe(false);
    expect(confirmsUsername("", "Kaito")).toBe(false);
  });
});
