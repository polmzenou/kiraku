import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import fr from "@/messages/fr.json";
import { SHOWCASE_THEMES } from "@/lib/showcase/theme-registry";
import { ProfileShowcases, type ShelfShowcase } from "./ProfileShowcases";
import { ShowcaseBanner } from "./ShowcaseBanner";

vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-intl")>();
  return { ...original, useTranslations: (namespace: "showcase") => original.createTranslator({ locale: "fr", messages: fr, namespace }) };
});
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement("a", { ...props, href }, children),
}));
// La scène et le bouton « Afficher » ont leurs propres tests : ici, seulement leur place
vi.mock("./ShowcaseView", () => ({ ShowcaseView: ({ theme }: { theme: string }) => createElement("div", { className: "vt-stage", "data-theme": theme }, "SCÈNE") }));
vi.mock("./MakeMainButton", () => ({ MakeMainButton: () => createElement("button", null, "AFFICHER") }));

const gold: ShelfShowcase = { id: "sc-1", name: "Lumière divine", layout: "PYRAMID", theme: "gold", count: 6 };
const eclat: ShelfShowcase = { id: "sc-2", name: "Nuées d'or", layout: "FAN", theme: "eclat", count: 5 };
const plain: ShelfShowcase = { id: "sc-3", name: "Effets", layout: "GRID_3X3", theme: "none", count: 9 };

const render = (showcases: ShelfShowcase[], isOwner: boolean) =>
  renderToStaticMarkup(createElement(ProfileShowcases, { username: "Tristren", isOwner, showcases, mainCards: [], owned: [], linkBase: isOwner ? "/collection" : "/wiki" }));

describe("bannière du profil", () => {
  it("montre l'image fixe du décor de la vitrine principale, téléphone et ordinateur", () => {
    const html = renderToStaticMarkup(createElement(ShowcaseBanner, { theme: "gold" }));
    const media = SHOWCASE_THEMES.gold.media!;
    expect(html).toContain('class="vt-banner" data-theme="gold" aria-hidden="true"');
    expect(html).toContain(`srcSet="${media.desktop.still}"`);
    expect(html).toContain(`src="${media.mobile.still}"`);
    expect(html).not.toContain("<video");
  });

  it("rien sans décor", () => {
    expect(renderToStaticMarkup(createElement(ShowcaseBanner, { theme: "none" }))).toBe("");
  });
});

describe("section Vitrines du profil", () => {
  it("le cartel suit la scène, avec le sceau du décor et le lien vers la vitrine", () => {
    const html = render([gold], true);
    expect(html.indexOf("SCÈNE")).toBeLessThan(html.indexOf("vt-plate"));
    expect(html).toContain(`>${SHOWCASE_THEMES.gold.kanji}</span>`);
    expect(html).toContain("Vitrine principale");
    expect(html).toContain('href="/u/Tristren/vitrines/sc-1"');
  });

  it("pas de sceau ni de libellé « Vitrine principale » hors décor et pour un visiteur", () => {
    const html = render([{ ...gold, theme: "none" }], false);
    expect(html).not.toContain("vt-seal");
    expect(html).not.toContain("Vitrine principale");
  });

  it("vitrine principale vide chez un visiteur : le cartel puis le message, sans scène", () => {
    const html = render([{ ...gold, count: 0 }], false);
    expect(html).not.toContain("SCÈNE");
    // Le rendu HTML échappe l'apostrophe du message
    const message = html.indexOf(fr.showcase.emptyPublic.replaceAll("'", "&#x27;"));
    expect(message).toBeGreaterThan(-1);
    expect(html.indexOf("vt-plate")).toBeLessThan(message);
  });

  it("l'étagère montre le décor de chaque vitrine, rien pour Sans décor", () => {
    const html = render([gold, eclat, plain], true);
    const items = html.split('<li class="vt-shelf-item').slice(1);
    expect(items).toHaveLength(2);
    expect(items[0]).toContain('data-media=""');
    expect(items[0]).toContain(`src="${SHOWCASE_THEMES.eclat.media!.mobile.still}"`);
    expect(items[1]).not.toContain("data-media");
    expect(items[1]).not.toContain("<img");
  });
});
