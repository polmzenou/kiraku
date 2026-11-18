import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import fr from "@/messages/fr.json";
import { Fuda } from "./Fuda";

vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-intl")>();
  return { ...original, useTranslations: (namespace: "rarity" | "fuda" | "battle.board") => original.createTranslator({ locale: "fr", messages: fr, namespace }) };
});
vi.mock("next/image", () => ({
  default: ({ src, alt, className }: { src: string; alt: string; className: string }) => createElement("img", { src, alt, className }),
}));

const card = { name: "Luffy", nameNative: null, imageUrl: "https://s4.anilist.co/luffy.png", rank: 3, power: 90, ki: 70, spoiler: false };
const render = (rarity: string, appearance: object = {}, props: object = {}) =>
  renderToStaticMarkup(createElement(Fuda, { card: { ...card, rarity, appearance }, tilt: false, ...props }));

describe("préréglages des raretés visuelles", () => {
  it("MR, VR et BR : l'image telle quelle, l'holographie et le sceau kanji", () => {
    for (const [rarity, seal] of [["MR", "漫"], ["VR", "彩"], ["BR", "闇"]]) {
      const html = render(rarity);
      expect(html).toContain("fuda-effect-holographic");
      expect(html).toContain(`>${seal}</span>`);
      expect(html).not.toContain("fuda-art-");
      expect(html).not.toContain("data-full-art");
      expect(html.match(/<img/g)).toHaveLength(1);
      expect(html).not.toContain("fuda-sheen");
    }
  });
  it("gardent l'inclinaison 3D commune à toutes les fuda", () => {
    expect(render("MR", {}, { tilt: true })).toContain("kf-tilt");
    expect(render("BR", {}, { still: true })).not.toContain("kf-tilt");
  });
  it("XR : Full Art et holographie, le détourage n'apparaît que s'il est fourni", () => {
    const html = render("XR");
    expect(html).toContain('data-full-art="true"');
    expect(html).toContain("fuda-effect-holographic");
    expect(html).not.toContain("kn-cutout");
    expect(render("XR", { cutoutUrl: "https://s4.anilist.co/cut.png" })).toContain("kn-cutout");
  });
  it("Esprit : pleine carte spectrale, sans reflet, laque ni sceau de rareté", () => {
    const html = render("SR");
    expect(html).toContain('data-spectral="true"');
    expect(html).toContain('data-full-art="true"');
    expect(html).not.toContain("kn-seal");
    expect(html).not.toContain("霊");
    // Sans le spectral, la carte retrouve son sceau
    expect(render("SR", { spectral: false })).toContain(">霊</span>");
    expect(html).not.toContain("fuda-effect");
    expect(html).not.toContain("fuda-sheen");
    // L'image reste dans la page (texte alternatif, repli CSS) ; le canvas se monte côté client seulement
    expect(html.match(/<img/g)).toHaveLength(1);
    expect(html).toContain("kn-spectral-host");
    expect(html).not.toContain("<canvas");
  });
  it("Esprit : pas de canvas sur les petites cartes ni les cartes figées, rien de spectral une fois verrouillée", () => {
    expect(render("SR", {}, { still: true })).not.toContain("kn-spectral-host");
    expect(render("SR", {}, { size: "sm" })).not.toContain("kn-spectral-host");
    expect(render("SR", {}, { still: true })).toContain('data-spectral="true"');
    expect(render("SR", { spectral: false })).not.toContain("data-spectral");
    const locked = render("SR", {}, { locked: true });
    expect(locked).not.toContain("data-spectral");
    expect(locked).not.toContain("luffy.png");
  });
  it("ne révèle ni l'image ni le détourage d'une carte verrouillée", () => {
    const locked = render("XR", { cutoutUrl: "https://s4.anilist.co/cut.png" }, { locked: true });
    expect(locked).not.toContain("cut.png");
    expect(locked).not.toContain("luffy.png");
    expect(locked).not.toContain("data-full-art");
  });
});
