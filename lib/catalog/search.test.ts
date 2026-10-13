import { describe, expect, it } from "vitest";
import { buildSearchText, normalizeSearch } from "./search";

describe("recherche du wiki", () => {
  it("retire accents, casse et ponctuation", () => {
    expect(normalizeSearch("  Rémi  ÉLÉONORE ")).toBe("remi eleonore");
    expect(normalizeSearch("HUNTER×HUNTER (2011)")).toBe("hunter hunter 2011");
    expect(normalizeSearch("Satoru Gojou")).toBe(normalizeSearch("satoru   GOJOU"));
  });

  it("garde les kanji et les kana", () => {
    expect(normalizeSearch("五条 悟")).toBe("五条 悟");
    expect(normalizeSearch("ルフィ")).toBe("ルフィ");
  });

  it("assemble le texte indexé sans doublon ni valeur vide", () => {
    expect(buildSearchText(["Levi", null, "Shingeki no Kyojin", "Attack on Titan", "shingeki no kyojin", ""])).toBe(
      "levi shingeki no kyojin attack on titan",
    );
  });
});
