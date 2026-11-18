import { describe, expect, it } from "vitest";
import { goldPixel, GOLD_TONE } from "./gold";

describe("filtre Gold des images de partage", () => {
  it("compose sepia, saturate et hue-rotate en une matrice 3 × 3", () => {
    expect(GOLD_TONE.matrix).toHaveLength(3);
    for (const row of GOLD_TONE.matrix) expect(row.every(Number.isFinite)).toBe(true);
    expect(GOLD_TONE.slope).toBeCloseTo(1.1232, 4);
    expect(GOLD_TONE.intercept).toBeCloseTo(-10.2, 4);
  });

  it("dore les tons : un gris moyen devient chaud (rouge > vert > bleu)", () => {
    const [r, g, b] = goldPixel([128, 128, 128]);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });

  it("garde le noir noir et rend le blanc or pâle, bornés à 0–255", () => {
    expect(goldPixel([0, 0, 0])).toEqual([0, 0, 0]);
    const [r, g, b] = goldPixel([255, 255, 255]);
    expect([r, g]).toEqual([255, 255]);
    expect(b).toBeGreaterThan(150);
    expect(b).toBeLessThan(200);
  });
});
