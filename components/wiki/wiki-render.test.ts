import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fr from "@/messages/fr.json";
import { emptyWikiCollection, type WikiCollection } from "@/lib/catalog/wiki-state";
import { parseWikiParams } from "@/lib/catalog/wiki-params";
import type { CatalogCardDetail, CatalogCardSummary } from "@/server/catalog/queries";
import { WikiGrid } from "./WikiGrid";
import { WikiCardDetail } from "./WikiCardDetail";
import { Fuda } from "@/components/fuda/Fuda";

const { biographyCalls } = vi.hoisted(() => ({ biographyCalls: vi.fn() }));

vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-intl")>();
  return { ...original, useTranslations: (namespace: "wiki" | "wiki.roles" | "rarity" | "fuda") => original.createTranslator({ locale: "fr", messages: fr, namespace }) };
});
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string | { pathname: string }; children: ReactNode }) =>
    createElement("a", { ...props, href: typeof href === "string" ? href : href.pathname }, children),
}));
vi.mock("next/image", () => ({
  default: ({ src, alt, className }: { src: string; alt: string; className: string }) => createElement("img", { src, alt, className }),
}));
vi.mock("@/components/fuda/FudaTurnover", () => ({
  FudaTurnover: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));
vi.mock("@/server/catalog/ownership", () => ({ getWikiCollection: vi.fn() }));
vi.mock("./WikiBiography", () => ({
  WikiBiography: ({ anilistId }: { anilistId: number }) => {
    biographyCalls(anilistId);
    return createElement("p", null, "UNLOCKED BIOGRAPHY");
  },
  WikiBiographySkeleton: () => createElement("p", null, "loading"),
}));

const card: CatalogCardDetail = {
  id: "card-a", anilistId: 1, publicId: 1, sourceAnilistId: 1, status: "PUBLISHED", appearance: {}, description: {}, name: "Levi", nameNative: "リヴァイ", imageUrl: "https://s4.anilist.co/levi.png",
  rank: 2, rarity: "MYTHIC", power: 100, ki: 84, favorites: 38199, role: "MAIN", seriesId: "series-a",
  series: { titleRomaji: "Attack on Titan", titleEnglish: null, titleNative: null, type: "ANIME" }, formName: null, variantOf: null, variants: [],
};
const related: CatalogCardSummary = { ...card, anilistId: 2, name: "SECRET RELATED NAME", nameNative: "秘密" };
const collection: WikiCollection = { available: true, hasCards: true, cards: new Map([[1, { copies: 2, discovered: true }]]) };

beforeEach(() => biographyCalls.mockClear());

describe("rendu accessible du wiki", () => {
  it("applique les couleurs personnalisées au cadre et aux statistiques d’une rareté existante", () => {
    const html = renderToStaticMarkup(createElement(Fuda, {
      card: { ...card, appearance: { frame: "#123456", ink: "#abcdef", effects: [] } }, tilt: false,
    }));
    expect(html).toContain("--fuda-frame-bg:#123456");
    expect(html).toContain("color:#abcdef");
    expect(html).not.toContain('class="fuda-sheen"');
  });
  it("dore l'artwork d'une carte Gold et affiche le nom de forme d'une variante AR", () => {
    const gold = renderToStaticMarkup(createElement(Fuda, { card: { ...card, rarity: "GOLD", formName: "Gold" }, series: "Jujutsu Kaisen", tilt: false }));
    expect(gold).toContain("fuda-art-gold");
    expect(gold).toContain('class="fuda-gilt"');
    expect(gold).toContain('data-rarity="GOLD"');
    // Rareté au-dessus de Mythique : reflet de matière comme les paliers Épique et plus.
    expect(gold).toContain('class="fuda-sheen"');
    const natural = renderToStaticMarkup(createElement(Fuda, { card: { ...card, rarity: "GOLD", appearance: { artTone: "natural" } }, tilt: false }));
    expect(natural).not.toContain("fuda-art-gold");
    const ar = renderToStaticMarkup(createElement(Fuda, { card: { ...card, rarity: "AR", formName: "Mode Baryon" }, series: "Naruto", tilt: false }));
    expect(ar).toContain("Mode Baryon");
    expect(ar).not.toContain(">Naruto<");
    expect(ar).not.toContain("fuda-art-gold");
  });
  it("atténue seulement les manquantes, en gardant des liens nommés et des compteurs lisibles", () => {
    const html = renderToStaticMarkup(createElement(WikiGrid, {
      cards: [card, related], nextAfter: null, params: parseWikiParams({}), locale: "fr", collection, emptyCatalog: false,
    }));
    expect(html.match(/class="opacity-35 /g)).toHaveLength(1);
    expect(html).toContain('href="/wiki/2"');
    expect(html).toContain('aria-label="SECRET RELATED NAME · Attack on Titan · Mythique · Manquante"');
    expect(html).toContain("2 exemplaires possédés");
  });

  it("ne réduit aucune opacité pour un visiteur, une collection vide ou indisponible", () => {
    for (const viewer of [null, emptyWikiCollection(), emptyWikiCollection(false)]) {
      const html = renderToStaticMarkup(createElement(WikiGrid, {
        cards: [card, related], nextAfter: null, params: parseWikiParams({}), locale: "fr", collection: viewer, emptyCatalog: false,
      }));
      expect(html).not.toContain("opacity-35");
    }
  });

  it("garde la biographie verrouillée pendant le chargement, pour un visiteur ou une panne", () => {
    for (const viewer of [null, emptyWikiCollection(), emptyWikiCollection(false)]) {
      const html = renderToStaticMarkup(createElement(WikiCardDetail, { card, related: [related], locale: "fr", total: 6736, collection: viewer }));
      expect(html).toContain("Fiche verrouillée");
      expect(html).toContain("grayscale");
      expect(html).not.toContain("UNLOCKED BIOGRAPHY");
      expect(html).not.toContain("SECRET RELATED NAME");
      expect(html).not.toContain("Cote de la carte");
      expect(html).toContain('aria-label="??? · Mythique');
    }
    expect(biographyCalls).not.toHaveBeenCalled();
  });

  it("débloque définitivement la biographie après recyclage ou don du dernier exemplaire", () => {
    const history: WikiCollection = { available: true, hasCards: false, cards: new Map([[1, { copies: 0, discovered: true }], [2, { copies: 0, discovered: true }]]) };
    const html = renderToStaticMarkup(createElement(WikiCardDetail, { card, related: [related], locale: "fr", total: 6736, collection: history }));
    expect(html).toContain("Déjà découverte · Aucun exemplaire");
    expect(html).toContain("UNLOCKED BIOGRAPHY");
    expect(html).toContain("SECRET RELATED NAME");
    expect(html).not.toContain("grayscale");
    expect(biographyCalls).toHaveBeenCalledExactlyOnceWith(1);
  });
});
