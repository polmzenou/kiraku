import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import fr from "@/messages/fr.json";
import { CardThumb } from "@/components/market/listings/CardThumb";
import { Fuda } from "./Fuda";

// Vrai next/image : on vérifie que l'attribut data-spoiler arrive bien sur la balise <img> rendue.
vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-intl")>();
  return { ...original, useTranslations: (namespace: "rarity" | "fuda" | "battle.board") => original.createTranslator({ locale: "fr", messages: fr, namespace }) };
});

const card = { name: "Luffy", nameNative: "ルフィ", imageUrl: "https://s4.anilist.co/luffy.png", rank: 3, rarity: "MYTHIC", power: 90, ki: 70, appearance: {}, spoiler: false };
const render = (over: object = {}, props: object = {}) =>
  renderToStaticMarkup(createElement(Fuda, { card: { ...card, ...over }, tilt: false, ...props }));
const images = (html: string) => html.match(/<img[^>]*>/g) ?? [];

describe("mode spoiler sur la fuda", () => {
  it("marque l'illustration d'une carte spoil et garde nom, rareté et stats", () => {
    const html = render({ spoiler: true });
    expect(images(html)).toHaveLength(1);
    expect(images(html)[0]).toContain("data-spoiler");
    expect(html).toContain('class="kn-spoiler"');
    expect(html).toContain(">Spoil</span>");
    expect(html).toContain("Luffy");
    expect(html).toContain("ルフィ");
    expect(html).toContain('data-rarity="MYTHIC"');
    expect(html).toContain("Puissance 90");
  });

  it("ne touche pas une carte ordinaire", () => {
    const html = render();
    expect(html).not.toContain("data-spoiler");
    expect(html).not.toContain("kn-spoiler");
  });

  it("une carte verrouillée reste une silhouette, sans image ni étiquette", () => {
    const html = render({ spoiler: true }, { locked: true });
    expect(images(html)).toHaveLength(0);
    expect(html).not.toContain("data-spoiler");
    expect(html).not.toContain("kn-spoiler");
  });

  it("marque aussi le personnage détouré d'une Full Art", () => {
    const html = render({ spoiler: true, appearance: { fullArt: true, cutoutUrl: "https://s4.anilist.co/luffy-cut.png" } });
    expect(html).toMatch(/class="kn-cutout" data-spoiler=""/);
    expect(images(html)).toHaveLength(2);
  });

  it("marque la vignette d'une carte spoil hors fuda", () => {
    const thumb = (spoiler: boolean) =>
      renderToStaticMarkup(createElement(CardThumb, { card: { ...card, cardId: "c", anilistId: 1, series: "One Piece", spoiler } }));
    expect(thumb(true)).toMatch(/<img[^>]*data-spoiler/);
    expect(thumb(false)).not.toContain("data-spoiler");
  });
});
