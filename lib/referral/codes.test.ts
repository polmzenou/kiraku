import { describe, expect, it } from "vitest";
import { REFERRAL_CODE_PATTERN } from "@/lib/economy/referral";
import { checkVanityCode, parseInviteCode, VANITY_CODE_PATTERN } from "./codes";

describe("codes d'invitation", () => {
  it("reconnaît un code standard, saisi avec des espaces, des tirets ou en minuscules", () => {
    expect(parseInviteCode("k7xq-2m9p")).toEqual({ kind: "STANDARD", code: "K7XQ2M9P" });
    expect(parseInviteCode(" K7XQ 2M9P ")).toEqual({ kind: "STANDARD", code: "K7XQ2M9P" });
  });

  it("reconnaît un code perso", () => {
    expect(parseInviteCode("tristren")).toEqual({ kind: "VANITY", code: "TRISTREN" });
    expect(parseInviteCode("KIRAKU2026")).toEqual({ kind: "VANITY", code: "KIRAKU2026" });
  });

  it("refuse ce qui ne peut pas être un code", () => {
    for (const raw of ["", "ABC", "TROP-LONG-POUR-UN-CODE-PERSO", "é".repeat(6), "A".repeat(60), 42, null, undefined]) {
      expect(parseInviteCode(raw), String(raw)).toBeNull();
    }
  });
});

describe("codes perso", () => {
  it("accepte 4 à 16 lettres ou chiffres", () => {
    expect(checkVanityCode("tristren")).toEqual({ ok: true, code: "TRISTREN" });
    expect(checkVanityCode("AB")).toEqual({ ok: false, reason: "FORMAT" });
    expect(checkVanityCode("ÉCLAT")).toEqual({ ok: false, reason: "FORMAT" });
  });

  it("refuse un code perso qui pourrait être un code standard : les deux espaces sont disjoints", () => {
    expect(checkVanityCode("PAULMEHR")).toEqual({ ok: false, reason: "STANDARD_SHAPE" });
    const samples = ["TRISTREN", "PAULMEHR", "K7XQ2M9P", "ABCD", "ZZZZZZZZ", "Z2345678", "KIRAKU", "I0O1I0O1", "ABCDEFGHJKLMNPQR"];
    for (const raw of samples) {
      const checked = checkVanityCode(raw);
      if (checked.ok) {
        expect(VANITY_CODE_PATTERN.test(checked.code)).toBe(true);
        expect(REFERRAL_CODE_PATTERN.test(checked.code), checked.code).toBe(false);
      }
    }
  });
});
