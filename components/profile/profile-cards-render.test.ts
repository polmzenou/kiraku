import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import fr from "@/messages/fr.json";
import type { CardView } from "@/lib/boosters/view";
import { ProfileSalesSection, WishlistSection } from "./ProfileCardSections";

vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-intl")>();
  return { ...original, useTranslations: (namespace: "wishlist" | "profile.sales" | "fuda") => original.createTranslator({ locale: "fr", messages: fr, namespace }) };
});
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement("a", { ...props, href }, children),
}));
vi.mock("next/image", () => ({
  default: ({ src, alt, className }: { src: string; alt: string; className: string }) => createElement("img", { src, alt, className }),
}));
vi.mock("./WishlistToggle", () => ({ WishlistToggle: () => createElement("button", null, "OWNER REMOVE") }));

const card: CardView = {
  cardId: "card-1", anilistId: 4004, name: "Dio Brando", nameNative: null, series: "JoJo",
  imageUrl: "https://s4.anilist.co/dio.png", rarity: "RARE", rank: 100, power: 50, ki: 40,
};

describe("cartes publiques du profil", () => {
  it("affiche les souhaits en couleur avec leur vrai nom, sans possession du visiteur", () => {
    const html = renderToStaticMarkup(createElement(WishlistSection, { cards: [card], editable: false }));
    expect(html).toContain('href="/wiki/4004"');
    expect(html).toContain("Dio Brando");
    expect(html).toContain(card.imageUrl);
    expect(html).not.toMatch(/grayscale|opacity-35|OWNER REMOVE/);
  });

  it("réserve les boutons de gestion au propriétaire", () => {
    const html = renderToStaticMarkup(createElement(WishlistSection, { cards: [card], editable: true }));
    expect(html).toContain("OWNER REMOVE");
    expect(html).toContain("Choisir dans le wiki");
  });

  it("affiche le nombre de ventes sur la carte et un lien vers une vente ouverte", () => {
    const html = renderToStaticMarkup(createElement(ProfileSalesSection, { cards: [{ ...card, copies: 3, auctionId: "auction-1" }] }));
    expect(html).toContain('href="/marche/auction-1"');
    expect(html).toContain("×3");
    expect(html).toContain("3 exemplaires en vente");
    expect(html).not.toContain("grayscale");
  });
});
