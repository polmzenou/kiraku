import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import fr from "@/messages/fr.json";
import en from "@/messages/en.json";
import { CancelOrder, PostOrderForm, SellToOrder } from "./OrderActions";

vi.mock("@/server/actions/buy-orders", () => ({ cancelBuyOrderAction: vi.fn(), createBuyOrderAction: vi.fn(), fillBuyOrderAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

function render(locale: "fr" | "en", element: ReactElement) {
  const providerProps = { locale, messages: locale === "fr" ? fr : en, timeZone: "UTC", onError: (e: Error) => { throw e; }, children: null };
  return renderToStaticMarkup(createElement(NextIntlClientProvider, providerProps, element));
}

const form = (props: Partial<Parameters<typeof PostOrderForm>[0]> = {}) =>
  createElement(PostOrderForm, { cardId: "c1", suggested: 1200, min: 10, max: 5000, coins: 3000, days: 7, ...props });

describe("gestes des avis de recherche", () => {
  it.each(["fr", "en"] as const)("se rendent sans message manquant (%s)", (locale) => {
    for (const el of [createElement(SellToOrder, { orderId: "o1", price: 1200, net: 1140 }), createElement(CancelOrder, { orderId: "o1" }), form()]) {
      const html = render(locale, el);
      expect(html).not.toMatch(/MISSING_MESSAGE|NaN|undefined/);
    }
  });

  it("propose la vente au prix de l'offre, la confirmation vient au second clic", () => {
    const html = render("fr", createElement(SellToOrder, { orderId: "o1", price: 1200, net: 1140 }));
    expect(html).toMatch(/Vendre pour 1\s?200/);
    expect(html).not.toContain("Confirmer");
  });

  it("préremplit la cote, annonce le montant bloqué et la durée", () => {
    const html = render("fr", form());
    expect(html).toMatch(/value="1200"/);
    expect(html).toMatch(/1\s?200 Zeni seront bloqués/);
    expect(html).toContain("7 jours");
    expect(html).not.toMatch(/<button[^>]* disabled=""/);
  });

  it("borne la suggestion au plafond et bloque l'envoi au-delà du solde", () => {
    expect(render("fr", form({ suggested: 99_999 }))).toMatch(/value="5000"/);
    const poor = render("fr", form({ coins: 100 }));
    expect(poor).toContain("Il te faut ce montant");
    expect(poor).toMatch(/<button[^>]* disabled=""/);
  });
});
