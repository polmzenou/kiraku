import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import fr from "@/messages/fr.json";
import type { NavBadges } from "@/lib/nav";

vi.mock("@/i18n/navigation", async () => {
  const { createElement: h } = await import("react");
  return { Link: ({ prefetch, ...props }: Record<string, unknown>) => (void prefetch, h("a", props)), usePathname: () => "/" };
});
const { NavLinks } = await import("./NavLinks");
const providerProps = { locale: "fr" as const, messages: fr, timeZone: "Europe/Paris", children: null };

const render = (badges: NavBadges, casino = true) =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, providerProps, createElement(NavLinks, { layout: "stack", features: { casino, event: false, expedition: false }, badges })),
  );

/** Ligne du casino dans le panneau « Plus ». */
const casinoRow = (html: string) => html.match(/<a[^>]*href="\/casino"[^>]*>.*?<\/a>/)?.[0] ?? "";

describe("pastilles du casino dans la navigation", () => {
  it("« Bientôt » pendant le teaser", () => {
    const row = casinoRow(render({ casino: "soon" }));
    expect(row).toContain("Casino");
    expect(row).toContain("Bientôt");
    expect(row).not.toContain("Nouveau");
  });

  it("« Nouveau » après l'ouverture", () => {
    const row = casinoRow(render({ casino: "new" }));
    expect(row).toContain("Nouveau");
    expect(row).not.toContain("Bientôt");
  });

  it("aucune pastille une fois la nouveauté passée", () => {
    const row = casinoRow(render({}));
    expect(row).toContain("Casino");
    expect(row).not.toMatch(/Bientôt|Nouveau/);
  });

  it("casino caché : pas d'entrée", () => {
    expect(casinoRow(render({ casino: "new" }, false))).toBe("");
  });
});
