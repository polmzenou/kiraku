import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import fr from "@/messages/fr.json";
import type { CardView } from "@/lib/boosters/view";
import { CardThumb } from "./CardThumb";

vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-intl")>();
  return { ...original, useTranslations: (namespace: "rarity") => original.createTranslator({ locale: "fr", messages: fr, namespace }) };
});
vi.mock("next/image", () => ({
  default: ({ src, alt, className }: { src: string; alt: string; className: string }) => createElement("img", { src, alt, className }),
}));

const card: CardView = {
  cardId: "card-a", anilistId: 1, name: "Levi", nameNative: null, imageUrl: "https://s4.anilist.co/levi.png",
  rank: 2, rarity: "MYTHIC", power: 100, ki: 84, appearance: {}, series: "Attack on Titan",
};

describe("vignette de carte du marché", () => {
  it("dore l'illustration d'une carte Gold comme sur la fuda", () => {
    const gold = renderToStaticMarkup(createElement(CardThumb, { card: { ...card, rarity: "GOLD" } }));
    expect(gold).toContain("fuda-art-gold");
    expect(gold).toContain('class="fuda-gilt"');
  });
  it("laisse l'illustration naturelle pour les autres raretés ou une Gold réglée au naturel", () => {
    expect(renderToStaticMarkup(createElement(CardThumb, { card }))).not.toContain("fuda-art-gold");
    const natural = renderToStaticMarkup(createElement(CardThumb, { card: { ...card, rarity: "GOLD", appearance: { artTone: "natural" } } }));
    expect(natural).not.toContain("fuda-art-gold");
  });
});
