import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BOARD_TIERS } from "@/lib/battle/tiers";
import { rankArtworkPath, rankEmblemSrc } from "./artwork";

const DIVISIONS = [null, 1, 2, 3] as const;
const onDisk = (src: string) => existsSync(join(process.cwd(), "public", src));

describe("emblèmes des rangs", () => {
  it("sert le WebP de 128 px jusqu'à 42 px affichés, celui de 264 px au-delà", () => {
    expect(rankEmblemSrc("GOLD", 2, 28)).toBe("/ranks/gold-2-128-v1.webp");
    expect(rankEmblemSrc("GOLD", 2, 42)).toBe("/ranks/gold-2-128-v1.webp");
    expect(rankEmblemSrc("GOLD", 2, 56)).toBe("/ranks/gold-2-264-v1.webp");
    expect(rankEmblemSrc("GOLD", null, 88)).toBe("/ranks/gold-264-v1.webp");
  });

  it("le Grand Champion n'a qu'un emblème, sans division", () => {
    expect(rankEmblemSrc("GRAND_CHAMPION", 2, 28)).toBe("/ranks/grand-champion-128-v1.webp");
    expect(rankArtworkPath("GRAND_CHAMPION", 3)).toBe("/ranks/grand-champion.png");
  });

  it("chaque rang et chaque division a son PNG source et ses deux WebP dans public/ranks (npm run ranks:assets)", () => {
    for (const tier of BOARD_TIERS) {
      for (const division of DIVISIONS) {
        expect(onDisk(rankArtworkPath(tier, division)), rankArtworkPath(tier, division)).toBe(true);
        for (const size of [28, 88]) expect(onDisk(rankEmblemSrc(tier, division, size)), rankEmblemSrc(tier, division, size)).toBe(true);
      }
    }
  });
});
