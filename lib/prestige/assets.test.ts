import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRESTIGE_ASSET_VERSION, PRESTIGE_ASSETS, scrollCover } from "./assets";

// La version des images du prestige est écrite à quatre endroits (lib/prestige/assets.ts, le script qui les produit,
// et les URL des fonds CSS) : relevée à un seul, le navigateur servirait l'ancienne image, ou une image absente.

const read = (path: string) => readFileSync(resolve(path), "utf8");
const CSS = ["components/prestige/prestige.css", "components/prestige/prestige-rites.css", "components/opening/BarenReveal.css"];

describe("version des images du prestige", () => {
  it("chaque fond CSS sous /prestige/ porte la version de lib/prestige/assets.ts", () => {
    for (const file of CSS) {
      const urls = [...read(file).matchAll(/\/prestige\/[\w/-]+-v(\d+)\.(?:webp|mp4)/g)];
      expect(urls.length, file).toBeGreaterThan(0);
      for (const [url, version] of urls) expect(Number(version), `${file} : ${url}`).toBe(PRESTIGE_ASSET_VERSION);
    }
  });

  it("le script de production des images écrit la même version", () => {
    const script = read("scripts/prestige-assets.mjs").match(/^const V = (\d+);/m);
    expect(script?.[1]).toBe(String(PRESTIGE_ASSET_VERSION));
  });

  it("les chemins du code portent la version", () => {
    expect(PRESTIGE_ASSETS.rite.portrait).toMatch(new RegExp(`-v${PRESTIGE_ASSET_VERSION}\\.webp$`));
    expect(scrollCover(5)).toMatch(new RegExp(`^/prestige/fx/rouleau-violet-v${PRESTIGE_ASSET_VERSION}\\.webp$`));
  });
});
