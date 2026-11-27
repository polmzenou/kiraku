import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { cutFresco, FrescoCutError } from "./cut";

const image = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 60, b: 40 } } }).png().toBuffer();

describe("découpe d'une fresque", () => {
  it("recadre en 4:3, garde au plus 2400 px et découpe 12 fragments jointifs", async () => {
    const cut = await cutFresco(new Uint8Array(await image(3200, 1800)));
    expect([cut.width, cut.height]).toEqual([2400, 1800]);
    expect(cut.pieces).toHaveLength(12);
    const sizes = await Promise.all(cut.pieces.map(async (p) => (await sharp(p.data).metadata()).width));
    expect(new Set(sizes)).toEqual(new Set([600]));
    expect((await sharp(cut.full).metadata()).format).toBe("webp");
    expect((await sharp(cut.teaser).metadata()).width).toBe(48);
  });

  it("garde la taille d'une image plus petite que 2400 px", async () => {
    const cut = await cutFresco(new Uint8Array(await image(1600, 1200)));
    expect([cut.width, cut.height]).toEqual([1600, 1200]);
    expect(cut.pieces.map((p) => p.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("refuse une image trop petite ou illisible", async () => {
    await expect(cutFresco(new Uint8Array(await image(1000, 750)))).rejects.toMatchObject({ code: "IMAGE_TOO_SMALL" });
    await expect(cutFresco(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(FrescoCutError);
  });
});
