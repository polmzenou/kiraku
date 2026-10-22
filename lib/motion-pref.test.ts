import { describe, expect, it } from "vitest";
import { parseMotionPref } from "./motion-pref";

describe("parseMotionPref", () => {
  it("garde une préférence connue", () => {
    expect(parseMotionPref("reduced")).toBe("reduced");
    expect(parseMotionPref("full")).toBe("full");
    expect(parseMotionPref("lite")).toBe("lite");
    expect(parseMotionPref("auto")).toBe("auto");
  });

  it("laisse l'appareil choisir sinon", () => {
    expect(parseMotionPref(undefined)).toBe("auto");
    expect(parseMotionPref("off")).toBe("auto");
  });
});
