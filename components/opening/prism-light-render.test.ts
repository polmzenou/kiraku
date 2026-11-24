import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PrismBurst, PrismHalo, PrismWash } from "./PrismLight";

describe("lumière du prisme", () => {
  it("jaillit en éventail, faisceau, anneaux, éclair et 24 étincelles colorées", () => {
    const html = renderToStaticMarkup(createElement(PrismBurst, { lite: false }));
    for (const layer of ["prism-fan", "prism-beam", "prism-ring", "prism-ring-pop", "prism-flash"]) expect(html).toContain(layer);
    expect(html.match(/class="prism-spark"/g)).toHaveLength(24);
    expect(html).toContain("--c:#ff67ba");
    expect(html).not.toContain("data-lite");
  });

  it("allège la gerbe sur un appareil qui rame", () => {
    const html = renderToStaticMarkup(createElement(PrismBurst, { lite: true }));
    expect(html.match(/class="prism-spark"/g)).toHaveLength(10);
    expect(html).toContain("data-lite");
  });

  it("éteint le halo quand le sachet tombe, et le voile reste décoratif", () => {
    expect(renderToStaticMarkup(createElement(PrismHalo, { lite: false, fading: false }))).not.toContain("data-fading");
    expect(renderToStaticMarkup(createElement(PrismHalo, { lite: false, fading: true }))).toContain("data-fading");
    expect(renderToStaticMarkup(createElement(PrismWash))).toContain('aria-hidden="true"');
  });
});
