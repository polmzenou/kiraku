import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import fr from "@/messages/fr.json";

vi.mock("@/i18n/navigation", async () => {
  const { createElement: h } = await import("react");
  return { Link: ({ prefetch, ...props }: Record<string, unknown>) => (void prefetch, h("a", props)), usePathname: () => "/marche" };
});
const { NavLinks } = await import("./NavLinks");
const { NavRail } = await import("./NavRail");
const providerProps = { locale: "fr" as const, messages: fr, timeZone: "Europe/Paris", children: null };
const features = { casino: true, event: true, expedition: true };
const wrap = (child: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(NextIntlClientProvider, providerProps, child));

const HREFS = ["/", "/collection", "/combat", "/expedition", "/missions", "/casino", "/boutique", "/marche", "/event", "/amis", "/social", "/parrainage", "/wiki"];

describe("barre du haut à menus groupés", () => {
  const html = wrap(createElement(NavLinks, { layout: "bar", features, alerts: { missions: true } }));

  it("Boosters et Collection en direct, puis Jouer · Échanger · Communauté", () => {
    expect(html.indexOf("Boosters")).toBeLessThan(html.indexOf("Jouer"));
    expect(html).toContain("Échanger");
    expect(html).toContain("Communauté");
    expect(html).not.toContain(">Plus<");
  });

  it("toutes les entrées sont rendues, avec leur description", () => {
    for (const href of HREFS) expect(html).toContain(`href="${href}"`);
    expect(html).toContain("Enchères entre joueurs");
  });

  it("le groupe de la page courante est marqué, la pastille de mission remonte sur Jouer", () => {
    expect(html).toMatch(/aria-current="true"[^>]*>(?:(?!<\/button>).)*Échanger/);
    expect(html).toMatch(/Jouer(?:(?!<\/button>).)*Récompense à réclamer/);
  });

  it("entrée désactivée : pas d'event ni de casino", () => {
    const off = wrap(createElement(NavLinks, { layout: "bar", features: { casino: false, event: false, expedition: true } }));
    expect(off).not.toContain('href="/casino"');
    expect(off).not.toContain('href="/event"');
  });
});

describe("barre latérale", () => {
  const html = wrap(createElement(NavRail, { features, badges: { casino: "new" } }));

  it("toutes les entrées, page courante marquée, visible seulement en mode rail", () => {
    for (const href of HREFS) expect(html).toContain(`href="${href}"`);
    expect(html).toMatch(/href="\/marche" aria-current="page"/);
    expect(html).toContain("lg:nav-rail:flex");
    expect(html).toContain("Nouveau");
  });
});
