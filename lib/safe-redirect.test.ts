import { describe, expect, it } from "vitest";
import { safeRedirect } from "./safe-redirect";

const base = "https://kiraku.example";

describe("safeRedirect", () => {
  it("accepte un chemin interne", () => {
    expect(safeRedirect("/en/collection", base)).toBe(`${base}/en/collection`);
  });

  it("accepte une URL absolue du même site", () => {
    expect(safeRedirect(`${base}/boosters`, base)).toBe(`${base}/boosters`);
  });

  it.each(["https://evil.example/", "//evil.example", "/\\evil.example", "javascript:alert(1)"])(
    "refuse %s",
    (url) => {
      expect(safeRedirect(url, base)).toBe(base);
    },
  );
});
