import { describe, expect, it } from "vitest";
import { blankCard, bulkCatalogSchema, cardFormSchema, rarityFormSchema } from "./admin-form";
import { appearanceSchema } from "./appearance";
import { imageSignature, validCardImageUrl } from "./media";

describe("validation du catalogue admin", () => {
  const valid = { ...blankCard("series"), name: "Original" };
  it("accepte un brouillon original sans AniList ni image, exige une image à la publication", () => {
    expect(cardFormSchema.safeParse(valid).success).toBe(true);
    expect(cardFormSchema.safeParse({ ...valid, status: "PUBLISHED" }).success).toBe(false);
    expect(cardFormSchema.safeParse({ ...valid, status: "PUBLISHED", imageUrl: "https://s4.anilist.co/image.png" }).success).toBe(true);
  });
  it("exige une version pour modifier une carte et borne stats et poids", () => {
    expect(cardFormSchema.safeParse({ ...valid, id: "card" }).success).toBe(false);
    expect(cardFormSchema.safeParse({ ...valid, dropWeight: -1 }).success).toBe(false);
    expect(cardFormSchema.safeParse({ ...valid, power: 1000 }).success).toBe(false);
  });
  it("refuse du CSS libre et des effets inconnus", () => {
    expect(appearanceSchema.safeParse({ frame: "url(javascript:alert(1))" }).success).toBe(false);
    expect(appearanceSchema.safeParse({ effects: ["unknown"] }).success).toBe(false);
    expect(appearanceSchema.safeParse({ duration: 99 }).success).toBe(false);
    expect(rarityFormSchema.safeParse({ key: "bad key" }).success).toBe(false);
  });
  it("valide la forme d'une variante et les actions groupées", () => {
    expect(cardFormSchema.safeParse({ ...valid, variantOfId: "base-card", formName: "Gear 5" }).success).toBe(true);
    expect(cardFormSchema.safeParse({ ...valid, variantOfId: "../x" }).success).toBe(false);
    expect(appearanceSchema.safeParse({ artTone: "gold" }).success).toBe(true);
    expect(appearanceSchema.safeParse({ artTone: "rainbow" }).success).toBe(false);
    expect(bulkCatalogSchema.safeParse({ ids: ["a"], action: "archive" }).success).toBe(true);
    expect(bulkCatalogSchema.safeParse({ ids: ["a"], action: "setRarity" }).success).toBe(false);
    expect(bulkCatalogSchema.safeParse({ ids: ["a"], action: "addBooster", boosterId: "b" }).success).toBe(true);
    expect(bulkCatalogSchema.safeParse({ ids: [], action: "archive" }).success).toBe(false);
    expect(bulkCatalogSchema.safeParse({ ids: Array.from({ length: 101 }, (_, i) => `c${i}`), action: "archive" }).success).toBe(false);
  });
  it("vérifie les signatures et limite les URL au stockage configuré", () => {
    expect(imageSignature(new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]))).toBe("image/png");
    expect(imageSignature(new TextEncoder().encode("<svg onload=alert(1) />"))).toBeNull();
    expect(validCardImageUrl("https://test.public.blob.vercel-storage.com/cards/a.webp", "test.public.blob.vercel-storage.com")).toBe(true);
    expect(validCardImageUrl("https://evil.com/cards/a.webp", "test.public.blob.vercel-storage.com")).toBe(false);
    expect(validCardImageUrl("https://s4.anilist.co.evil.com/a.png")).toBe(false);
    expect(validCardImageUrl("javascript:alert(1)")).toBe(false);
  });
});
