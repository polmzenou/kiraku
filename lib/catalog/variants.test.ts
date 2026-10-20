import { describe, expect, it } from "vitest";
import { validateVariant } from "./variants";

const base = { id: "luffy", variantOfId: null, imageUrl: "https://blob/luffy.webp" };

describe("validateVariant", () => {
  it("laisse passer une carte normale", () => {
    expect(validateVariant({ variantOfId: null, imageUrl: "" }, null, false)).toBeNull();
  });
  it("exige une base pour une rareté de variante", () => {
    expect(validateVariant({ variantOfId: null, imageUrl: "https://blob/g5.webp" }, null, true)).toBe("VARIANT_REQUIRED");
  });
  it("accepte une variante avec sa propre image", () => {
    expect(validateVariant({ variantOfId: "luffy", imageUrl: "https://blob/g5.webp" }, base, true)).toBeNull();
  });
  it("refuse l'image de la base ou une image vide", () => {
    expect(validateVariant({ variantOfId: "luffy", imageUrl: base.imageUrl }, base, true)).toBe("VARIANT_IMAGE_REUSED");
    expect(validateVariant({ variantOfId: "luffy", imageUrl: "" }, base, true)).toBe("VARIANT_IMAGE_REUSED");
  });
  it("refuse une base absente, une chaîne de variantes ou la carte elle-même", () => {
    expect(validateVariant({ variantOfId: "luffy", imageUrl: "x" }, null, true)).toBe("VARIANT_INVALID");
    expect(validateVariant({ variantOfId: "luffy", imageUrl: "x" }, { ...base, variantOfId: "other" }, true)).toBe("VARIANT_INVALID");
    expect(validateVariant({ id: "luffy", variantOfId: "luffy", imageUrl: "x" }, base, true)).toBe("VARIANT_INVALID");
  });
});
