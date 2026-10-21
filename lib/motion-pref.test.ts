import { describe, expect, it } from "vitest";
import { parseMotionPref } from "./motion-pref";

describe("parseMotionPref", () => {
  it("garde une préférence connue", () => {
    expect(parseMotionPref("reduced")).toBe("reduced");
    expect(parseMotionPref("full")).toBe("full");
  });

  it("garde les animations sinon", () => {
    expect(parseMotionPref(undefined)).toBe("full");
    expect(parseMotionPref("off")).toBe("full");
  });
});
