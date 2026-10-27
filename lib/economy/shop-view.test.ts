import { describe, expect, it } from "vitest";
import { buildShopView, lotSaleIssue, purchaseKey, shopLotFrom, type ShopBoosterType, type ShopItemRow, type ShopLot } from "./shop-view";

const NOW = new Date("2026-10-14T12:00:00Z"); // mercredi, semaine 2026-W42
const TZ = "Europe/Paris";
const DEFINITIONS = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"].map((key, sortOrder) => ({ key, sortOrder }));
const FLOORS = ["COMMON", "COMMON", "UNCOMMON", "RARE"];

function type(slug: string, over: Partial<ShopBoosterType> = {}): ShopBoosterType {
  return {
    id: `t-${slug}`,
    kind: "FILTERED",
    family: "genre",
    floors: FLOORS,
    poolSize: 300,
    availability: "open",
    priceZeni: 200,
    ...over,
  };
}

const TYPES = new Map<string, ShopBoosterType>([
  ["standard", type("standard", { kind: "STANDARD", family: "standard" })],
  ["shonen", type("shonen", { family: "demographie", availability: "hidden" })], // au repos dans la rotation
  ["seinen", type("seinen", { family: "demographie" })], // dans la sélection du moment
  ["mecha", type("mecha")],
  ["horreur", type("horreur", { availability: "hidden" })], // inactif
  ["jubako", type("jubako", { kind: "FORMAT", family: "formats", priceZeni: 550, floors: ["COMMON", "EPIC"] })],
  ["mythique", type("mythique", { kind: "RARITY", family: "rarete", priceZeni: null, availability: "locked", floors: ["EPIC", "MYTHIC"] })],
  ["divin", type("divin", { kind: "DROP", family: "special", priceZeni: null, availability: "hidden" })],
]);

const boosterLot = (slug: string, quantity = 5, zeni = 0) =>
  shopLotFrom({ zeni, lines: [{ kind: "BOOSTER" as const, quantity, look: { slug } }] });

const LOTS = new Map<string, ShopLot<object>>([
  ["l-std5", boosterLot("standard")],
  ["l-std10", boosterLot("standard", 10)],
  ["l-shonen", boosterLot("shonen")],
  ["l-seinen", boosterLot("seinen")],
  ["l-mecha", boosterLot("mecha")],
  ["l-horreur", boosterLot("horreur")],
  ["l-jubako", boosterLot("jubako")],
  ["l-mythique", boosterLot("mythique", 1)],
  ["l-divin", boosterLot("divin", 1)],
  ["l-fuda", shopLotFrom({ zeni: 0, lines: [{ kind: "RARITY_CARD" as const, quantity: 1, rarity: "EPIC" }] })],
]);

const item = (id: string, lotId: string, priceZeni: number, over: Partial<ShopItemRow> = {}): ShopItemRow => ({
  id,
  name: id,
  description: "",
  lotId,
  priceZeni,
  perUserLimit: null,
  limitPeriod: null,
  endsAt: null,
  ...over,
});

const ITEMS = [
  item("std5", "l-std5", 900),
  item("std10", "l-std10", 1700, { perUserLimit: 3, limitPeriod: "WEEKLY" }),
  item("fuda", "l-fuda", 2500, { perUserLimit: 1, limitPeriod: "DAILY" }),
  item("shonen", "l-shonen", 900, { perUserLimit: 2, limitPeriod: "WEEKLY" }),
  item("seinen", "l-seinen", 900, { perUserLimit: 2, limitPeriod: "WEEKLY" }),
  item("mecha", "l-mecha", 900, { perUserLimit: 2, limitPeriod: "WEEKLY", endsAt: new Date(NOW.getTime() + 86_400_000) }),
  item("horreur", "l-horreur", 900),
  item("jubako", "l-jubako", 2475, { perUserLimit: 2, limitPeriod: "WEEKLY" }),
  item("mythique", "l-mythique", 99),
  item("divin", "l-divin", 99),
  item("orphelin", "l-absent", 100),
];

function view(over: { bought?: Map<string, number>; credits?: Map<string, number>; turn?: number } = {}) {
  return buildShopView({
    items: ITEMS,
    lots: LOTS,
    types: TYPES,
    bought: over.bought ?? new Map(),
    credits: over.credits ?? new Map(),
    definitions: DEFINITIONS,
    now: NOW,
    timeZone: TZ,
    turn: over.turn ?? 41_200,
  });
}

const allCards = (v: ReturnType<typeof view>) => v.sections.flatMap((s) => s.cards);

describe("vue de la boutique", () => {
  it("ne garde que la sélection du moment et ce qui se vend : ni Mythique, ni sachet scellé, ni type caché, ni lot absent", () => {
    expect(allCards(view()).map((c) => c.id)).toEqual(["std5", "std10", "jubako", "seinen", "mecha", "fuda"]);
  });

  it("range par famille dans l'ordre des boosters, puis les extras", () => {
    expect(view().sections.map((s) => s.key)).toEqual(["standard", "formats", "demographie", "genre", "other"]);
  });

  it("calcule prix barré et remise pour un pack d'un seul type", () => {
    const cards = new Map(allCards(view()).map((c) => [c.id, c]));
    expect(cards.get("std5")).toMatchObject({ reference: 1000, discount: 0.1 });
    expect(cards.get("std10")).toMatchObject({ reference: 2000, discount: 0.15 });
    expect(cards.get("jubako")).toMatchObject({ reference: 2750, discount: 0.1 });
    expect(cards.get("fuda")).toMatchObject({ reference: null, discount: null });
  });

  it("compte les achats dans la fenêtre de chaque limite", () => {
    const bought = new Map([
      [purchaseKey("seinen", "2026-W42"), 2],
      [purchaseKey("mecha", "2026-W41"), 2], // semaine passée : ne compte plus
      [purchaseKey("fuda", "2026-10-14"), 1],
    ]);
    const cards = new Map(allCards(view({ bought })).map((c) => [c.id, c]));
    expect(cards.get("seinen")!.remaining).toBe(0);
    expect(cards.get("mecha")!.remaining).toBe(2);
    expect(cards.get("fuda")!.remaining).toBe(0);
    expect(cards.get("std5")!.remaining).toBeNull();
    // Remise à zéro : lundi 19 octobre à minuit, heure de Paris
    expect(cards.get("seinen")!.limit!.resetsAt).toEqual(new Date("2026-10-18T22:00:00Z"));
  });

  it("signale les crédits possédés, la fin proche et le lien d'ouverture", () => {
    const cards = new Map(allCards(view({ credits: new Map([["t-mecha", 3]]) })).map((c) => [c.id, c]));
    expect(cards.get("seinen")!.booster).toMatchObject({ family: "demographie", owned: 0 });
    expect(cards.get("mecha")!.booster).toMatchObject({ owned: 3, poolSize: 300 });
    expect(cards.get("mecha")!.endsSoon).toBe(true);
    expect(cards.get("mecha")!.openHref).toBe("/ouvrir/mecha?credit=1&n=5");
    expect(cards.get("std10")!.openHref).toBe("/ouvrir/standard?credit=1&n=10");
    expect(cards.get("fuda")!.openHref).toBeNull();
  });

  it("met en vedette un pack thématique ou un format de la sélection, jamais un pack standard, une carte ni un type au repos", () => {
    const seen = new Set<string>();
    for (let turn = 41_200; turn < 41_220; turn++) {
      const v = view({ turn });
      expect(["jubako", "seinen", "mecha"]).toContain(v.featured?.id);
      expect(allCards(v).filter((c) => c.featured).map((c) => c.id)).toEqual([v.featured!.id]);
      seen.add(v.featured!.id);
    }
    expect(seen.size).toBe(3);
  });

  it("la vedette ne change pas au sein d'une même sélection", () => {
    expect(view({ turn: 41_207 }).featured?.id).toBe(view({ turn: 41_207 }).featured?.id);
    expect(view({ turn: 41_207 }).featured?.id).not.toBe(view({ turn: 41_208 }).featured?.id);
  });

  it("la vedette ne dépend pas des achats du joueur", () => {
    const bought = new Map([[purchaseKey("seinen", "2026-W42"), 2], [purchaseKey("mecha", "2026-W42"), 2]]);
    expect(view({ bought }).featured?.id).toBe(view().featured?.id);
  });

  it("décision de vente partagée avec l'achat", () => {
    expect(lotSaleIssue(LOTS.get("l-mecha")!, TYPES, DEFINITIONS)).toBeNull();
    expect(lotSaleIssue(LOTS.get("l-shonen")!, TYPES, DEFINITIONS)).toBe("UNSELLABLE"); // au repos : hors sélection
    expect(lotSaleIssue(LOTS.get("l-horreur")!, TYPES, DEFINITIONS)).toBe("UNSELLABLE");
    expect(lotSaleIssue(LOTS.get("l-divin")!, TYPES, DEFINITIONS)).toBe("UNSELLABLE"); // caché avant d'être scellé
    expect(lotSaleIssue(boosterLot("inconnu"), TYPES, DEFINITIONS)).toBe("UNSELLABLE");
    expect(lotSaleIssue(shopLotFrom({ zeni: 0, lines: [{ kind: "RARITY_CARD" as const, quantity: 1, rarity: "MYTHIC" }] }), TYPES, DEFINITIONS)).toBe("MYTHIC");
    const sealedOpen = new Map([...TYPES, ["divin", { ...TYPES.get("divin")!, availability: "open" as const }]]);
    expect(lotSaleIssue(LOTS.get("l-divin")!, sealedOpen, DEFINITIONS)).toBe("SEALED");
  });
});
