import { describe, expect, it } from "vitest";
import { containsPattern, escapeLike, parsePlayerQuery, prefixPattern } from "./search";

describe("saisie de la recherche de joueurs", () => {
  it("accepte un morceau de pseudo de 3 à 20 caractères, espaces autour retirés", () => {
    expect(parsePlayerQuery("  kai ")).toEqual({ ok: true, q: "kai" });
    expect(parsePlayerQuery("Gojo_Satoru-99")).toEqual({ ok: true, q: "Gojo_Satoru-99" });
    expect(parsePlayerQuery("a".repeat(20))).toEqual({ ok: true, q: "a".repeat(20) });
  });

  it("distingue vide, trop court et invalide", () => {
    expect(parsePlayerQuery(undefined)).toEqual({ ok: false, reason: "EMPTY" });
    expect(parsePlayerQuery("   ")).toEqual({ ok: false, reason: "EMPTY" });
    expect(parsePlayerQuery("ab")).toEqual({ ok: false, reason: "SHORT" });
    expect(parsePlayerQuery("a".repeat(21))).toEqual({ ok: false, reason: "INVALID" });
    for (const bad of ["ab cd", "kai%", "kai'--", "名前名前", "a\\b"]) {
      expect(parsePlayerQuery(bad), bad).toEqual({ ok: false, reason: "INVALID" });
    }
  });
});

describe("motifs ILIKE", () => {
  it("échappe les jokers : « _ » d'un pseudo ne vaut pas n'importe quel caractère", () => {
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("50%")).toBe("50\\%");
    expect(escapeLike("a\\b")).toBe("a\\\\b");
    expect(escapeLike("kai-99")).toBe("kai-99");
  });

  it("cherche dans tout le pseudo, et classe ceux qui commencent par la saisie", () => {
    expect(containsPattern("kai")).toBe("%kai%");
    expect(prefixPattern("ka_i")).toBe("ka\\_i%");
  });
});
