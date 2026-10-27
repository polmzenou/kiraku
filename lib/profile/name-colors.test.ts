import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NAME_COLOR_GRADIENT, NAME_COLOR_STYLES } from "./name-colors";

// Les images de partage peignent le pseudo sans le CSS : leurs dégradés doivent suivre globals.css (Yoru).
const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8").replace(/\r\n/g, "\n");

describe("couleurs de pseudo hors du DOM", () => {
  it("reprennent les teintes Yoru de globals.css", () => {
    for (const style of NAME_COLOR_STYLES) {
      const colors = NAME_COLOR_GRADIENT[style].match(/#[0-9a-f]{6}/gi) ?? [];
      expect(colors.length, style).toBeGreaterThanOrEqual(3);
      if (style === "rainbow" || style === "pastel") {
        expect(css, style).toContain(`.name-color-${style} {\n    background-image: linear-gradient(90deg, ${colors.join(", ")});`);
      } else {
        const [light, base, dark] = colors;
        expect(css, style).toContain(`.name-color-${style} {\n    --nc-light: ${light};\n    --nc-base: ${base};\n    --nc-dark: ${dark};`);
      }
    }
  });
});
