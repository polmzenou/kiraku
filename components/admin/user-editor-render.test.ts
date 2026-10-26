import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import fr from "@/messages/fr.json";
import en from "@/messages/en.json";
import { UserEditor } from "./UserEditor";

vi.mock("@/server/actions/admin-users", () => ({ mutateAdminUserAction: vi.fn(), searchAdminCards: vi.fn() }));
vi.mock("next/image", () => ({ default: "img" }));

function render(locale: "fr" | "en", self = false, empty = false) {
  const providerProps = { locale, messages: locale === "fr" ? fr : en, timeZone: "UTC", onError: (e: Error) => { throw e; }, children: null };
  return renderToStaticMarkup(createElement(NextIntlClientProvider, providerProps, createElement(UserEditor, {
    userId: "player", self, ambassadorSince: null, account: { username: "Player", role: self ? "ADMIN" : "USER", banned: false, profileVisibility: "PUBLIC", showCollection: true },
    stats: { boosterStock: 5, rankPoints: 100, pityCount: 7, standardCount: 8 }, coins: 1000,
    boosters: empty ? [] : [{ id: "type", name: "Ancien événement", active: false, count: 3, pity: 4 }],
    discoveries: 20, catalogTotal: 100, ownedCatalogCards: 5, sessions: 2,
    selectedCard: empty ? null : { id: "card", anilistId: 1, name: "Levi", imageUrl: "https://s4.anilist.co/card.jpg", rarity: "MYTHIC", rank: null, series: "Attack on Titan" },
  })));
}

describe("rendu de la fiche admin", () => {
  it.each(["fr", "en"] as const)("affiche les commandes et les cartes hors catalogue en %s", (locale) => {
    const html = render(locale);
    expect(html).toContain('id="admin-card-form"');
    expect(html).toContain("Levi");
    expect(html).toContain("Ancien événement");
    expect(html).not.toContain("MISSING_MESSAGE");
    expect(html).not.toContain("NaN");
    expect(html.match(/<form/g)).toHaveLength(13);
  });
  it("rend un catalogue vide sans erreur", () => {
    const html = render("fr", false, true);
    expect(html).toContain("Aucun type de booster");
    expect(html).toContain("sélectionne-la");
  });
  it("désactive les actions qui retireraient son propre accès", () => {
    const html = render("fr", true);
    expect(html).toMatch(/<select[^>]*disabled=""/);
    expect(html).not.toContain("Bannir ce joueur");
    expect(html).toContain("propre rôle");
  });
});
