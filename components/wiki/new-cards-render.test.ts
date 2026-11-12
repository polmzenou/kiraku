import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import fr from "@/messages/fr.json";
import en from "@/messages/en.json";
import type { CatalogCardSummary } from "@/server/catalog/queries";
import type { ReleaseBooster } from "@/server/catalog/releases";
import { NewCardsView, type NewCardItem, type ReleaseView } from "./NewCardsView";

vi.mock("next/image", async () => {
  const { createElement: h } = await import("react");
  return { default: ({ src, alt, className, ...rest }: Record<string, unknown>) => h("img", { src, alt, className, "data-spoiler": rest["data-spoiler"] }) };
});
// Lien localisé comme le vrai (français sans préfixe, anglais sous /en), sans le routeur de Next
vi.mock("@/i18n/navigation", async () => {
  const { createElement: h } = await import("react");
  const { useLocale } = await import("next-intl");
  return {
    Link: function Link({ href, ...props }: { href: string } & Record<string, unknown>) {
      const locale = useLocale();
      return h("a", { ...props, href: locale === "en" ? `/en${href === "/" ? "" : href}` : href });
    },
  };
});

const MESSAGES = { fr, en };
const providerProps = (locale: "fr" | "en") => ({
  locale,
  messages: MESSAGES[locale],
  timeZone: "Europe/Paris",
  onError: (e: Error) => {
    throw e;
  },
  children: null,
});
const render = (locale: "fr" | "en", node: ReactElement) => renderToStaticMarkup(createElement(NextIntlClientProvider, providerProps(locale), node));

const summary = (anilistId: number, name: string, extra: Partial<CatalogCardSummary> = {}): CatalogCardSummary => ({
  anilistId, publicId: anilistId, sourceAnilistId: null, status: "PUBLISHED", appearance: {}, name, nameNative: null,
  imageUrl: `https://blob.example/${anilistId}.webp`, rank: null, rarity: "MYTHIC", power: 90, ki: 70, formName: null, spoiler: false,
  series: { titleRomaji: "One Piece", titleEnglish: null }, ...extra,
});
const item = (card: CatalogCardSummary, extra: Partial<NewCardItem> = {}): NewCardItem => ({
  card, premium: true, boosters: ["Impérial"], state: { copies: 0, discovered: false }, isNew: true, ...extra,
});
const imperial: ReleaseBooster = {
  slug: "imperial", name: "Impérial", emblem: "皇", shape: "JUBAKO", theme: { base: "#1E3557", dark: "#0B1424", pattern: "kikko", ink: "light" }, href: "/boutique", count: 2,
};
const standard: ReleaseBooster = { ...imperial, slug: "standard", name: "Standard", shape: "SACHET", href: "/?b=standard", count: 1 };

const latest: ReleaseView = {
  day: "2026-11-12",
  lastPublishedAt: "2026-11-12T10:00:00.000Z",
  items: [
    item(summary(1, "Luffy", { formName: "Gear 5", spoiler: true }), { state: { copies: 1, discovered: true }, boosters: ["Impérial", "Standard"] }),
    item(summary(2, "Zoro"), { premium: false, boosters: [] }),
    item(summary(3, "Nami"), { state: null }),
  ],
};
const previous: ReleaseView = {
  day: "2026-11-10",
  lastPublishedAt: "2026-11-10T15:00:00.000Z",
  items: [item(summary(4, "Sanji"), { isNew: false })],
};
const props = { latest, previous: [previous], boosters: [imperial, standard], badgeUntil: "2026-11-14T10:00:00.000Z", timeZone: "Europe/Paris", locale: "fr" };
/** Libellé lu du premier lien vers `href` (l'ordre des attributs ne compte pas). */
const labelOf = (html: string, href: string) => {
  const tag = html.match(new RegExp(`<a [^>]*href="${href.replace(/[?/]/g, "\\$&")}"[^>]*>`))?.[0] ?? "";
  return tag.match(/aria-label="([^"]*)"/)?.[1] ?? null;
};

describe("page des nouvelles cartes", () => {
  it("annonce la dernière sortie et la fin du badge", () => {
    const html = render("fr", createElement(NewCardsView, props));
    expect(html).toContain(">Nouvelles cartes</h1>");
    expect(html).toContain("Sortie du 12 novembre · 3 cartes");
    expect(html).toContain("Nouvelles jusqu&#x27;au 14 novembre à 11:00");
    expect(html).toContain('aria-label="Cartes de la sortie du 12 novembre"');
  });

  it("révèle chaque carte de la dernière sortie depuis son dos, à tour de rôle", () => {
    const html = render("fr", createElement(NewCardsView, props));
    const grid = html.slice(0, html.indexOf('id="nc-where"'));
    expect(grid.match(/class="nc-turn"/g)).toHaveLength(3);
    expect(grid).toContain("--nc-i:0");
    expect(grid).toContain("--nc-i:2");
    expect(grid.match(/class="kb-back ?"[^>]*data-flat="true"/g)).toHaveLength(3);
    expect(grid.match(/class="kb-back ?"[^>]*data-premium="true"/g)).toHaveLength(2);
  });

  it("dit ce que le joueur possède, où tirer chaque carte, et garde le flou des spoils", () => {
    const html = render("fr", createElement(NewCardsView, props));
    expect(labelOf(html, "/wiki/1")).toBe("Luffy · Gear 5 · One Piece · Mythique · Nouvelle carte · Acquise · Impérial +1");
    expect(labelOf(html, "/wiki/2")).toBe("Zoro · One Piece · Mythique · Nouvelle carte · À tirer · Hors des boosters du moment");
    // Collection illisible : aucune ligne d'état
    expect(labelOf(html, "/wiki/3")).toBe("Nami · One Piece · Mythique · Nouvelle carte · Impérial");
    expect(html).toMatch(/<img src="https:\/\/blob\.example\/1\.webp"[^>]*data-spoiler=""/);
    expect(html).toContain(">Nouveau</span>");
  });

  it("liste les boosters qui contiennent la sortie, avec un bouton vers chacun", () => {
    const html = render("fr", createElement(NewCardsView, props));
    expect(labelOf(html, "/boutique")).toBe("Ouvrir le booster Impérial · 2 nouvelles cartes sur 3");
    expect(labelOf(html, "/?b=standard")).toBe("Ouvrir le booster Standard · 1 nouvelle carte sur 3");
    expect(html).toContain("booster-art");
  });

  it("garde les quatre boosters les plus fournis visibles et replie les autres", () => {
    const many = ["a", "b", "c", "d", "e", "f"].map((slug) => ({ ...standard, slug, name: `Booster ${slug}`, href: `/?b=${slug}` }));
    const html = render("fr", createElement(NewCardsView, { ...props, boosters: many }));
    const [shown, folded] = html.slice(html.indexOf('id="nc-where"'), html.indexOf('id="nc-previous"')).split("<details>");
    expect(shown.match(/href="\/\?b=/g)).toHaveLength(4);
    expect(folded).toContain("Aussi dans 2 autres boosters");
    expect(folded.match(/href="\/\?b=/g)).toHaveLength(2);
    expect(render("fr", createElement(NewCardsView, props))).not.toContain("Aussi dans");
  });

  it("replie les sorties précédentes, sans révélation ni badge", () => {
    const html = render("fr", createElement(NewCardsView, props));
    const older = html.slice(html.indexOf("<details"));
    expect(older).toContain("Sortie du 10 novembre");
    expect(older).toContain("1 carte");
    expect(labelOf(older, "/wiki/4")).toBe("Sanji · One Piece · Mythique · À tirer · Impérial");
    expect(older).not.toContain("nc-turn");
    expect(older).not.toContain(">Nouveau<");
  });

  it("invite à parcourir le wiki quand rien n'est encore sorti", () => {
    const html = render("fr", createElement(NewCardsView, { ...props, latest: null, previous: [], boosters: [], badgeUntil: null }));
    expect(html).toContain("Aucune nouvelle carte pour l&#x27;instant");
    expect(html).toContain('href="/wiki"');
    expect(html).not.toContain("nc-where");
  });

  it("parle anglais sous /en", () => {
    const html = render("en", createElement(NewCardsView, { ...props, locale: "en" }));
    expect(html).toContain(">New cards</h1>");
    expect(html).toContain("Released November 12 · 3 cards");
    expect(html).toContain('href="/en/wiki/1"');
    expect(labelOf(html, "/en/?b=standard")).toBe("Open the Standard booster · 1 new card of 3");
  });
});
