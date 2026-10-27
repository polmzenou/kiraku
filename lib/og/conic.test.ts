import { describe, expect, it } from "vitest";
import { FRAME_RING, FRAME_STYLES } from "@/lib/profile/frames";
import { colorAt, conicRingSvg, parseConic } from "./conic";

describe("anneaux coniques des images de partage", () => {
  it("relit tous les cadres d'avatar", () => {
    for (const style of FRAME_STYLES) expect(parseConic(FRAME_RING[style]), style).not.toBeNull();
  });

  it("répartit les arrêts sans position et lit les pourcentages", () => {
    expect(parseConic("bg-[conic-gradient(from_90deg,#000000,#ffffff,#000000)]")).toEqual({
      from: 90,
      repeating: false,
      stops: [
        { color: "#000000", at: 0 },
        { color: "#ffffff", at: 180 },
        { color: "#000000", at: 360 },
      ],
    });
    const kintsugi = parseConic(FRAME_RING.kintsugi)!;
    [0, 28.8, 57.6, 162, 187.2, 216, 360].forEach((at, i) => expect(kintsugi.stops[i].at).toBeCloseTo(at));
  });

  it("interpole les couleurs et répète un dégradé repeating-conic", () => {
    const bw = parseConic("bg-[conic-gradient(from_0deg,#000000,#ffffff)]")!;
    expect(colorAt(bw, 0)).toBe("#000000");
    expect(colorAt(bw, 180)).toBe("#808080");
    const seigaiha = parseConic(FRAME_RING.seigaiha)!;
    expect(seigaiha.repeating).toBe(true);
    expect(colorAt(seigaiha, 18)).toBe("#2f5f93");
    expect(colorAt(seigaiha, 45 + 18)).toBe("#2f5f93");
  });

  it("refuse une classe qui n'est pas un dégradé conique", () => {
    expect(parseConic("bg-[linear-gradient(90deg,#000000,#ffffff)]")).toBeNull();
    expect(parseConic("bg-[conic-gradient(from_0deg,red,blue)]")).toBeNull();
  });

  it("peint l'anneau en secteurs SVG aux bonnes dimensions", () => {
    const svg = conicRingSvg(parseConic(FRAME_RING.kinpaku)!, 200, 12);
    expect(svg).toMatch(/^<svg [^>]*width="200" height="200"/);
    expect(svg.match(/<path /g)).toHaveLength(180);
  });
});
