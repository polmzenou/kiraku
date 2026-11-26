import { describe, expect, it } from "vitest";
import { buildQuotes, collectionValue, median, priceSeries, quoteFor, setterVotes, topMovers, type Sale } from "./quotes";

const now = new Date("2026-11-18T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
const rules = { windowDays: 30, minSales: 3 };
const sale = (cardId: string, price: number, ago: number, rarity = "EPIC"): Sale => ({ cardId, rarity, price, at: daysAgo(ago) });

describe("médiane", () => {
  it("prend la valeur centrale, ou la moyenne arrondie des deux centrales", () => {
    expect(median([])).toBeNull();
    expect(median([7])).toBe(7);
    expect(median([300, 100, 200])).toBe(200);
    expect(median([100, 200, 300, 401])).toBe(250);
    expect(median([1, 2])).toBe(2);
  });
});

describe("cote d'une carte", () => {
  it("n'affiche une cote qu'à partir du nombre minimal de ventes", () => {
    expect(quoteFor([sale("a", 100, 1), sale("a", 200, 2)], now, rules)).toEqual({ price: null, sales: 2, previous: null, changeBp: null });
    expect(quoteFor([sale("a", 100, 1), sale("a", 200, 2), sale("a", 300, 3)], now, rules).price).toBe(200);
  });

  it("ne bouge pas pour une vente extrême isolée", () => {
    const base = [sale("a", 100, 1), sale("a", 110, 2), sale("a", 105, 3)];
    expect(quoteFor([...base, sale("a", 1_000_000, 4)], now, rules).price).toBe(108);
  });

  it("sépare la fenêtre récente ]now − 30 j, now] de la précédente ]now − 60 j, now − 30 j]", () => {
    const sales = [
      sale("a", 200, 0), sale("a", 200, 10), sale("a", 200, 29.99),
      sale("a", 100, 30), sale("a", 100, 45), sale("a", 100, 59.99), // 30 jours pile : fenêtre précédente
      sale("a", 1, 60), // 60 jours pile : trop ancienne
    ];
    expect(quoteFor(sales, now, rules)).toEqual({ price: 200, sales: 3, previous: 100, changeBp: 10_000 });
  });

  it("ignore une vente datée après l'instant du calcul", () => {
    expect(quoteFor([sale("a", 100, 1), sale("a", 100, 2), sale("a", 100, 3), sale("a", 9_999, -1)], now, rules).price).toBe(100);
  });

  it("donne une tendance seulement si la fenêtre précédente a assez de ventes", () => {
    const quote = quoteFor([sale("a", 100, 1), sale("a", 100, 2), sale("a", 100, 3), sale("a", 50, 40), sale("a", 50, 41)], now, rules);
    expect(quote.previous).toBeNull();
    expect(quote.changeBp).toBeNull();
  });
});

describe("cotes du marché", () => {
  it("calcule chaque carte et la médiane récente de chaque rareté", () => {
    const sales = [
      sale("a", 100, 1), sale("a", 120, 2), sale("a", 140, 3),
      sale("b", 900, 1, "MYTHIC"), sale("b", 1100, 2, "MYTHIC"),
      sale("c", 1000, 1, "MYTHIC"),
      sale("c", 5, 40, "MYTHIC"), // fenêtre précédente : hors médiane de rareté
    ];
    const quotes = buildQuotes(sales, now, rules);
    expect(quotes.byCard.a).toMatchObject({ price: 120, sales: 3 });
    expect(quotes.byCard.b).toMatchObject({ price: null, sales: 2 });
    expect(quotes.byCard.c).toMatchObject({ price: null, sales: 1 });
    expect(quotes.byRarity).toEqual({ EPIC: 120, MYTHIC: 1000 });
  });

  it("ne garde aucune carte vendue hors des deux fenêtres", () => {
    expect(buildQuotes([sale("old", 100, 90)], now, rules)).toEqual({ byCard: {}, byRarity: {} });
  });
});

describe("marché inondé par un seul vendeur", () => {
  const by = (setter: string, cardId: string, price: number, ago = 1, rarity = "COMMON"): Sale => ({ ...sale(cardId, price, ago, rarity), setter });
  const strict = { ...rules, minSellers: 2, capMultiplier: 5 };
  // Trois joueurs vendent des communes autour de 10 Zeni ; un quatrième en écoule 40 à 450
  const honest = [by("ana", "c1", 8), by("ben", "c2", 10), by("ben", "c3", 12), by("cam", "c1", 11), by("cam", "c4", 9)];
  const flood = Array.from({ length: 40 }, (_, i) => by("spam", `c${(i % 4) + 1}`, 450));

  it("chaque joueur pèse la médiane de ses propres ventes, une vente sans joueur est sa propre voix", () => {
    expect(setterVotes([{ price: 450, setter: "s" }, { price: 450, setter: "s" }, { price: 10, setter: "a" }, { price: 7 }, { price: 9, setter: null }]).sort((a, b) => a - b)).toEqual([7, 9, 10, 450]);
  });

  it("la référence de la rareté ne bouge pas : le vendeur n'a qu'une voix", () => {
    expect(buildQuotes(honest, now, strict).byRarity.COMMON).toBe(10);
    expect(buildQuotes([...honest, ...flood], now, strict).byRarity.COMMON).toBe(11); // 4 voix : 8 · 11 · 10 · 450
    // L'ancien calcul (une voix par vente) s'envolait
    const anonymous = [...honest, ...flood].map((s) => ({ ...s, setter: undefined }));
    expect(buildQuotes(anonymous, now, rules).byRarity.COMMON).toBe(450);
  });

  it("la cote d'une carte reste plafonnée à un multiple de la référence de sa rareté", () => {
    const quotes = buildQuotes([...honest, ...flood], now, strict);
    // c1 : ana 8, cam 11, spam 450 → médiane 11 ; c2 : ben 10, spam 450 → 230, plafonnée à 5 × 11
    expect(quotes.byCard.c1.price).toBe(11);
    expect(quotes.byCard.c2.price).toBe(55);
  });

  it("un seul joueur ne suffit pas à coter une carte", () => {
    const solo = Array.from({ length: 10 }, () => by("spam", "x", 450, 1, "EPIC"));
    const quotes = buildQuotes(solo, now, strict);
    expect(quotes.byCard.x.price).toBeNull();
    expect(quotes.byRarity.EPIC).toBeUndefined();
  });

  it("sans réglage, une voix par vente et aucun plafond, comme avant", () => {
    expect(quoteFor([sale("a", 100, 1), sale("a", 100, 2), sale("a", 100, 3)], now, rules).price).toBe(100);
  });
});

describe("historique d'une carte", () => {
  it("regroupe les ventes par jour dans le fuseau du jeu, avec la cote glissante de chaque jour", () => {
    const sales = [
      { price: 50, at: daysAgo(91) }, // hors des 90 jours affichés, mais dans la fenêtre de cote du 17
      { price: 100, at: new Date("2026-11-17T22:30:00Z") }, // 23 h 30 à Paris : le 17
      { price: 300, at: new Date("2026-11-17T23:30:00Z") }, // 0 h 30 à Paris : le 18
      { price: 200, at: new Date("2026-11-18T08:00:00Z") },
    ];
    const series = priceSeries(sales, now, 90, 100, "Europe/Paris");
    expect(series.days).toEqual([
      { day: "2026-11-17", price: 75, sales: 1 }, // médiane de 50 et 100
      { day: "2026-11-18", price: 150, sales: 2 }, // médiane de 50, 100, 300, 200
    ]);
    expect(series.sales.map((s) => s.price)).toEqual([100, 300, 200]);
  });

  it("garde la ligne stable quand une seule vente sort de la norme", () => {
    const sales = [daysAgo(5), daysAgo(4), daysAgo(3), daysAgo(2)].map((at, i) => ({ price: i === 2 ? 10_000 : 100, at }));
    const series = priceSeries(sales, now, 90, 30, "Europe/Paris");
    expect(series.days.map((d) => d.price)).toEqual([100, 100, 100, 100]);
    expect(series.sales.map((s) => s.price)).toContain(10_000);
  });

  it("un seul vendeur qui enchaîne les ventes à prix absurde ne pèse qu'une voix sur la ligne", () => {
    const fair = [daysAgo(6), daysAgo(5), daysAgo(4)].map((at, i) => ({ price: 100, at, setter: `v${i}` }));
    const spam = [daysAgo(3), daysAgo(3), daysAgo(2), daysAgo(2), daysAgo(1)].map((at) => ({ price: 10_000, at, setter: "spam" }));
    const series = priceSeries([...fair, ...spam], now, 90, 30, "Europe/Paris");
    // Voix 100, 100, 100 et 10 000 : la médiane reste 100 (sans voix par joueur, 5 ventes sur 8 la tiraient à 10 000)
    expect(series.days.at(-1)?.price).toBe(100);
    // Marché sain, un vendeur par vente : la ligne ne change pas
    expect(priceSeries(fair, now, 90, 30, "Europe/Paris").days.map((d) => d.price)).toEqual([100, 100, 100]);
  });
});

describe("valeur de la collection", () => {
  const quotes = { byCard: { a: { price: 120, sales: 3, previous: null, changeBp: null }, b: { price: null, sales: 1, previous: null, changeBp: null } }, byRarity: { EPIC: 80 } };

  it("prend la cote de la carte, sinon la médiane de sa rareté, pour chaque exemplaire", () => {
    expect(collectionValue([
      { cardId: "a", rarity: "EPIC", copies: 2 },
      { cardId: "b", rarity: "EPIC", copies: 1 },
      { cardId: "z", rarity: "EPIC", copies: 3 },
      { cardId: "m", rarity: "MYTHIC", copies: 4 },
    ], quotes)).toEqual({ total: 240 + 80 + 240, fromCard: 240, fromRarity: 320, unpriced: 4 });
  });

  it("vaut zéro sans carte", () => {
    expect(collectionValue([], quotes)).toEqual({ total: 0, fromCard: 0, fromRarity: 0, unpriced: 0 });
  });
});

describe("plus fortes hausses", () => {
  const q = (price: number | null, changeBp: number | null, sales = 3) => ({ price, sales, previous: 100, changeBp });

  it("classe les hausses de la plus forte à la plus faible et écarte les baisses et les cartes sans tendance", () => {
    const quotes = { byRarity: {}, byCard: {
      flat: q(100, 0), down: q(80, -2_000), none: q(100, null), unquoted: q(null, null),
      small: q(110, 1_000), big: q(300, 20_000), tieMore: q(150, 5_000, 8), tieB: q(150, 5_000), tieA: q(150, 5_000),
    } };
    expect(topMovers(quotes, 10).map((m) => m.cardId)).toEqual(["big", "tieMore", "tieA", "tieB", "small"]);
    expect(topMovers(quotes, 2).map((m) => m.cardId)).toEqual(["big", "tieMore"]);
    expect(topMovers(quotes, 0)).toEqual([]);
  });
});
