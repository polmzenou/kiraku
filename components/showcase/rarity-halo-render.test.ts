import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { haloOf, RarityHalo } from "./RarityHalo";

// Composant sans hook : on l'appelle directement (createElement exige children dans les props pour le
// typage, ce que la règle react/no-children-prop refuse)
const render = (rarity: string | null, radius?: number) =>
  renderToStaticMarkup(RarityHalo({ rarity, delay: 1.5, radius, children: createElement("i", null, "carte") }));

/** Nombre d'enfants directs du conteneur `className` (éclats, lumières, paillettes, étoiles). */
function bits(html: string, className: string): number {
  const inner = html.match(new RegExp(`class="vt-halo-front ${className}">(.*?)</span></span>`))?.[1] ?? "";
  return (inner.match(/<span>/g) ?? []).length + (inner.match(/<svg/g) ?? []).length;
}

describe("effets autour des cartes en vitrine", () => {
  it("une rareté sans effet rend la carte telle quelle", () => {
    expect(render("COMMON")).toBe("<i>carte</i>");
    expect(render(null)).toBe("<i>carte</i>");
  });

  it("chaque rareté spéciale a son effet", () => {
    expect(["BR", "AR", "MYTHIC", "GOLD", "MR", "VR", "XR"].map(haloOf)).toEqual(["thread", "mirror", "motes", "gilt", "tone", "vitrail", "prism"]);
  });

  it("l'anneau suit l'arrondi de la carte et les animations sont décalées", () => {
    const html = render("BR", 14);
    expect(html).toContain("--vt-r:14px");
    expect(html).toContain("--vt-delay:-1.5s");
  });

  it("AR : un liseré fin et six éclats, trois de chaque côté, sans lueur", () => {
    const html = render("AR");
    expect(html).toContain("vt-halo-ring");
    expect(bits(html, "vt-halo-shards")).toBe(6);
    expect(html).not.toContain("vt-halo-glow");
  });

  it("XR : un filet et deux petites étoiles, sans aura", () => {
    const html = render("XR");
    expect(html).toContain("vt-halo-ring");
    expect(html.match(/<svg/g)).toHaveLength(2);
    expect(html).not.toContain("vt-halo-glow");
  });

  it("Mythique, Gold et MR n'ajoutent pas de lueur autour de la carte", () => {
    expect(bits(render("MYTHIC"), "vt-halo-motes")).toBe(8);
    expect(bits(render("GOLD"), "vt-halo-flakes")).toBe(4);
    for (const rarity of ["MYTHIC", "GOLD", "MR"]) expect(render(rarity)).not.toContain("vt-halo-glow");
  });
});
