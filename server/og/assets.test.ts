import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { processImage } = await import("./assets");

/** Image unie de 8 × 8 dans le format demandé. */
const solid = (format: "webp" | "png", rgb: [number, number, number]) =>
  sharp({ create: { width: 8, height: 8, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } })[format]().toBuffer();

async function meanOf(body: Buffer) {
  const { channels } = await sharp(body).stats();
  return channels.slice(0, 3).map((c) => Math.round(c.mean));
}

describe("illustrations des images de partage", () => {
  it("convertit le WebP des créations originales en PNG, que Satori sait lire", async () => {
    const out = await processImage(await solid("webp", [40, 120, 200]), "image/webp", false);
    expect(out?.type).toBe("image/png");
    expect((await sharp(out!.body).metadata()).format).toBe("png");
  });

  it("laisse un JPEG ou un PNG ordinaire tel quel", async () => {
    const png = await solid("png", [10, 20, 30]);
    expect(await processImage(png, "image/png", false)).toEqual({ body: png, type: "image/png" });
  });

  it("applique la teinte Gold du site : un gris devient doré", async () => {
    const out = await processImage(await solid("png", [128, 128, 128]), "image/png", true);
    const [r, g, b] = await meanOf(out!.body);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(r - b).toBeGreaterThan(80);
  });
});
