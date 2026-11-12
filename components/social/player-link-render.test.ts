import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import fr from "@/messages/fr.json";
import { anonymousPlayer, type ShownPlayer } from "@/lib/social/shown-player";
import { PlayerLink } from "./PlayerLink";

vi.mock("next/image", async () => {
  const { createElement: h } = await import("react");
  return { default: ({ src, alt }: Record<string, unknown>) => h("img", { src, alt }) };
});
vi.mock("@/i18n/navigation", async () => {
  const { createElement: h } = await import("react");
  return { Link: ({ href, ...props }: { href: string } & Record<string, unknown>) => h("a", { ...props, href }) };
});

const providerProps = { locale: "fr" as const, messages: fr, timeZone: "Europe/Paris", children: null };
const render = (node: ReactElement) => renderToStaticMarkup(createElement(NextIntlClientProvider, providerProps, node));

describe("pseudo d'un joueur sur le marché", () => {
  it("montre à l'admin le pseudo caché, suivi d'un cadenas expliqué, sans lien", () => {
    const html = render(createElement(PlayerLink, { player: { ...anonymousPlayer("Kaito"), locked: true } satisfies ShownPlayer }));
    expect(html).toContain(">Kaito<");
    expect(html).toContain("Caché aux joueurs : pseudo visible par l’admin seulement");
    expect(html).toContain("<svg");
    expect(html).not.toContain("<a ");
  });

  it("n'ajoute aucun cadenas pour un joueur public ou un libellé générique", () => {
    const shown: ShownPlayer = { name: "Rin", profile: "Rin", image: null, color: null, frame: null };
    const html = render(createElement(PlayerLink, { player: shown }));
    expect(html).toContain('href="/u/Rin"');
    expect(html).not.toContain("Caché aux joueurs");
    expect(render(createElement(PlayerLink, { player: anonymousPlayer("Joueur") }))).not.toContain("Caché aux joueurs");
  });
});
