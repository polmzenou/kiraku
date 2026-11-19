import { createElement, type ComponentProps, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import fr from "@/messages/fr.json";
import en from "@/messages/en.json";
import { CollectionStats } from "@/components/collection/CollectionStats";
import { priceSeries } from "@/lib/market/quotes";
import { niceTicks, PriceChart, scaleBounds } from "./PriceChart";

const NOW = new Date("2026-11-18T12:00:00Z");
const daysAgo = (d: number, price: number) => ({ price, at: new Date(NOW.getTime() - d * 86_400_000) });

function render(locale: "fr" | "en", element: ReactElement) {
  const providerProps = { locale, messages: locale === "fr" ? fr : en, timeZone: "UTC", onError: (e: Error) => { throw e; }, children: null };
  return renderToStaticMarkup(createElement(NextIntlClientProvider, providerProps, element));
}

function chart(sales: { price: number; at: Date }[]): ComponentProps<typeof PriceChart> {
  const series = priceSeries(sales, NOW, 90, 30, "Europe/Paris");
  return { ...series, historyDays: 90, now: NOW.toISOString(), summary: "Cote de 120 Zeni" };
}

describe("courbe de la cote", () => {
  it.each([
    ["une vente", [daysAgo(3, 120)]],
    ["plusieurs ventes", [daysAgo(80, 90), daysAgo(40, 110), daysAgo(40, 130), daysAgo(10, 150), daysAgo(1, 140)]],
    ["une série plate", [daysAgo(20, 100), daysAgo(10, 100), daysAgo(2, 100)]],
    ["des prix élevés", [daysAgo(5, 2_400_000), daysAgo(4, 2_600_000), daysAgo(3, 2_500_000)]],
  ])("se rend sans valeur invalide en français et en anglais : %s", (_, sales) => {
    for (const locale of ["fr", "en"] as const) {
      const html = render(locale, createElement(PriceChart, chart(sales)));
      expect(html).not.toMatch(/NaN|Infinity|MISSING_MESSAGE/);
      expect(html).toContain('role="img"');
      expect(html).toContain('aria-label="Cote de 120 Zeni"');
      // Un point par vente, plus le point de la dernière médiane
      expect(html.match(/<circle/g)).toHaveLength(sales.length + 1);
      // Le tableau des lecteurs d'écran reprend chaque jour
      expect(html.match(/<tr>/g)).toHaveLength(new Set(sales.map((s) => s.at.toISOString().slice(0, 10))).size + 1);
    }
  });

  it("ne trace la ligne qu'à partir de deux jours de ventes", () => {
    expect(render("fr", createElement(PriceChart, chart([daysAgo(3, 120)])))).not.toContain("<path");
    expect(render("fr", createElement(PriceChart, chart([daysAgo(3, 120), daysAgo(2, 130)])))).toContain("<path");
  });

  it("pose une vente hors norme au bord, en cercle creux, sans écraser l'échelle", () => {
    const html = render("fr", createElement(PriceChart, chart([daysAgo(9, 100), daysAgo(8, 110), daysAgo(7, 105), daysAgo(6, 50_000), daysAgo(5, 108)])));
    expect(html.match(/fill="none"/g)).toHaveLength(2); // la ligne de cote et la vente hors norme
    expect(html).not.toMatch(/>50s?000</);
  });

  it("borne l'axe sans les ventes hors norme, mais avec toute la ligne de cote", () => {
    expect(scaleBounds([100, 105, 108, 110, 50_000], [104, 106])).toEqual({ lo: 100, hi: 110 });
    expect(scaleBounds([100, 105, 108, 110, 50_000], [104, 900])).toEqual({ lo: 100, hi: 900 });
    expect(scaleBounds([1, 100, 105, 108, 110], [104])).toEqual({ lo: 100, hi: 110 });
    expect(scaleBounds([500, 1000, 1500, 2000, 2500], [1500])).toEqual({ lo: 500, hi: 2500 });
    expect(scaleBounds([], [])).toEqual({ lo: 0, hi: 0 });
  });

  it("gradue l'axe avec des valeurs rondes", () => {
    expect(niceTicks(90, 150)).toEqual([50, 100, 150]);
    expect(niceTicks(90, 150, 5)).toEqual([80, 100, 120, 140, 160]);
    expect(niceTicks(0, 1000)).toEqual([0, 500, 1000]);
    expect(niceTicks(100, 100)).toEqual([100]);
    expect(niceTicks(Number.NaN, 5)).toEqual([]);
  });
});

describe("valeur estimée de la collection", () => {
  const summary = { unique: 3, copies: 5, inCatalog: 3, catalogTotal: 10, recyclable: 0, recyclableZeni: 0, byRarity: {} } as ComponentProps<typeof CollectionStats>["summary"];

  it("ajoute la valeur et précise la part estimée par rareté", () => {
    const html = render("fr", createElement(CollectionStats, { summary, value: { total: 1500, fromCard: 1000, fromRarity: 500, unpriced: 2 } }));
    expect(html).toContain("Valeur estimée");
    expect(html).toMatch(/1\s?500 Zeni/);
    expect(html).toMatch(/dont 500 Zeni estimés/);
    expect(html).toContain("2 exemplaires sans cote");
    expect(html).not.toContain("MISSING_MESSAGE");
  });

  it("garde trois cases sans valeur (collection d'un autre joueur)", () => {
    const html = render("en", createElement(CollectionStats, { summary }));
    expect(html).not.toContain("Estimated value");
    expect(html).toContain("grid-cols-3");
  });
});
