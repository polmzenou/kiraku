import { describe, expect, it } from "vitest";
import { parseTheme } from "./theme";

describe("parseTheme", () => {
  it("garde un thème connu", () => {
    expect(parseTheme("washi")).toBe("washi");
    expect(parseTheme("yoru")).toBe("yoru");
  });

  it("retombe sur Yoru sinon", () => {
    expect(parseTheme(undefined)).toBe("yoru");
    expect(parseTheme("neon")).toBe("yoru");
  });
});
