import { describe, expect, it } from "vitest";
import { safeRedirect } from "./safe-redirect";

const base = "https://kiraku.example";

describe("safeRedirect", () => {
  it("accepte un chemin interne", () => {
    expect(safeRedirect("/en/collection", base)).toBe(`${base}/en/collection`);
    expect(safeRedirect("/compte?onglet=donnees", base)).toBe(`${base}/compte?onglet=donnees`);
  });

  it("accepte une URL absolue du même site", () => {
    expect(safeRedirect(`${base}/boosters`, base)).toBe(`${base}/boosters`);
  });

  it.each([
    "https://evil.example/",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    // Tabulation et sauts de ligne retirés par l'analyse d'URL : « //evil.example »
    "/\t/evil.example",
    "/\n/evil.example",
    "/\r\n/evil.example",
    "http://kiraku.example/",
  ])(
    "refuse %s",
    (url) => {
      expect(safeRedirect(url, base)).toBe(base);
    },
  );
});
