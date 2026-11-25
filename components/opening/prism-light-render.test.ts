import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PrismBurst, PrismHalo, PrismWash } from "./PrismLight";

describe("lumière du prisme", () => {
  it("devant : le cœur de la fente, l'éclair du pop et 24 étincelles nacrées, sans bandes ni anneaux", () => {
    const html = renderToStaticMarkup(createElement(PrismBurst, { lite: false }));
    for (const layer of ["prism-core", "prism-flash"]) expect(html).toContain(layer);
    for (const old of ["prism-fan", "prism-beam", "prism-ring"]) expect(html).not.toContain(old);
    expect(html.match(/class="prism-spark"/g)).toHaveLength(24);
    expect(html).toContain("--c:#ffb3da");
    expect(html).not.toContain("data-lite");
  });

  it("allège la gerbe sur un appareil qui rame", () => {
    const html = renderToStaticMarkup(createElement(PrismBurst, { lite: true }));
    expect(html.match(/class="prism-spark"/g)).toHaveLength(10);
    expect(html).toContain("data-lite");
  });

  it("derrière : halo et rayons centrés sur l'ouverture de chaque forme, éteints quand le sachet tombe", () => {
    const halo = (props: { fading?: boolean; shape?: "SACHET" | "POCHIBUKURO" | "JUBAKO" }) =>
      renderToStaticMarkup(createElement(PrismHalo, { lite: false, fading: props.fading ?? false, shape: props.shape ?? "SACHET" }));
    expect(halo({})).toContain("prism-aura");
    expect(halo({})).toContain("prism-rays");
    expect(halo({})).toContain("--seam:13%");
    expect(halo({ shape: "POCHIBUKURO" })).toContain("--seam:20%");
    expect(halo({ shape: "JUBAKO" })).toContain("--seam:8%");
    expect(halo({})).not.toContain("data-fading");
    expect(halo({ fading: true })).toContain("data-fading");
    expect(renderToStaticMarkup(createElement(PrismWash))).toContain('aria-hidden="true"');
  });
});
