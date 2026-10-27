import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { isDynamicFilter } from "@/lib/boosters/pool-filter";
import { effectiveSlotFloors, SLUG_PATTERN } from "@/lib/boosters/types";
import { BASE_RARITIES } from "@/lib/catalog/rarity";
import { lotInputSchema } from "@/lib/economy/lots";
import { shopContentIssue, shopItemInputSchema } from "@/lib/economy/shop";
import { SETTING_DEFAULTS } from "@/lib/settings/defaults";
import { BOOSTER_SEEDS } from "./booster-types";
import { MISSION_SEEDS, shopPackSeeds, upsertEconomySeeds, upsertMissionSeeds } from "./economy";

const EXPECTED = [
  "shonen", "seinen", "shojo", "josei",
  "isekai", "sport", "mecha", "horreur", "romance", "fantasy", "science-fiction", "tranche-de-vie", "comedie", "psychologique", "musique",
  "waifus", "husbandos", "protagonistes", "antagonistes", "seconds-roles",
  "retro", "annees-2000", "nouvelle-vague",
  "manga", "pochibukuro", "jubako",
];
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const packs = shopPackSeeds();
const typeSlug = (lot: (typeof packs.lots)[number]) => lot.boosters?.[0]?.slug ?? "";
const sorted = (values: readonly string[]) => [...values].sort();

type LotData = { id: string; name: unknown; zeni: number; items: { create: unknown[] } };
type ItemData = { slug: string; lotId: string; sortOrder: number };

/** Base simulée : ce que le seed crée est relu au passage suivant ; toute écriture hors create est espionnée. */
function fakeDb(types: readonly { slug: string; kind: string; priceZeni: number | null }[], existingItems: readonly { slug: string; lotId: string }[] = []) {
  const lots = new Set<string>(existingItems.map((i) => i.lotId));
  const missions = new Set<string>();
  const items = new Set<string>(existingItems.map((i) => i.slug));
  const itemLots = new Set<string>(existingItems.map((i) => i.lotId));
  const settings = new Set<string>();
  const rows = types.map((t) => ({ id: `id-${t.slug}`, ...t }));
  const writes = () => ({ update: vi.fn(), updateMany: vi.fn(), upsert: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() });
  return {
    boosterType: {
      ...writes(),
      findUnique: vi.fn(),
      findMany: vi.fn(async (args: { where: { slug: { in: string[] } } }) => rows.filter((t) => args.where.slug.in.includes(t.slug))),
    },
    lot: {
      ...writes(),
      findUnique: vi.fn(async (args: { where: { id: string } }) => (lots.has(args.where.id) ? { id: args.where.id } : null)),
      findMany: vi.fn(async () => [...lots].map((id) => ({ id }))),
      create: vi.fn(async (args: { data: LotData }) => void lots.add(args.data.id)),
    },
    mission: {
      ...writes(),
      findUnique: vi.fn(async (args: { where: { key: string } }) => (missions.has(args.where.key) ? { id: args.where.key } : null)),
      create: vi.fn(async (args: { data: { key: string } }) => void missions.add(args.data.key)),
    },
    shopItem: {
      ...writes(),
      findUnique: vi.fn(async (args: { where: { slug: string } }) => (items.has(args.where.slug) ? { id: args.where.slug } : null)),
      findFirst: vi.fn(async (args: { where: { OR: [{ slug: string }, { lotId: string }] } }) => {
        const [{ slug }, { lotId }] = args.where.OR;
        return items.has(slug) || itemLots.has(lotId) ? { id: slug } : null;
      }),
      create: vi.fn(async (args: { data: ItemData }) => {
        items.add(args.data.slug);
        itemLots.add(args.data.lotId);
      }),
    },
    gameSetting: {
      ...writes(),
      findUnique: vi.fn(async (args: { where: { key: string } }) => (settings.has(args.where.key) ? { key: args.where.key } : null)),
      create: vi.fn(async (args: { data: { key: string } }) => void settings.add(args.data.key)),
    },
  };
}

type FakeDb = ReturnType<typeof fakeDb>;
const ALL_TYPES = BOOSTER_SEEDS.map((s) => ({ slug: s.slug, kind: s.kind, priceZeni: s.priceZeni ?? null }));
const createdLots = (db: FakeDb) => new Map(db.lot.create.mock.calls.map(([args]) => [args.data.id, args.data]));
const createdItems = (db: FakeDb) => db.shopItem.create.mock.calls.map(([args]) => args.data);

function expectNoUpdate(db: FakeDb) {
  for (const [model, mocks] of Object.entries(db)) {
    for (const name of ["update", "updateMany", "upsert", "delete", "deleteMany"] as const) {
      expect(mocks[name], `${model}.${name}`).not.toHaveBeenCalled();
    }
  }
}

describe("packs de la boutique", () => {
  it("vend exactement les 26 types attendus : ni standard, ni rareté, ni scellé, ni pool du jour, ni type inactif", () => {
    const slugs = packs.lots.map(typeSlug);
    expect(sorted(slugs)).toEqual(sorted(EXPECTED));
    for (const slug of slugs) {
      const seed = BOOSTER_SEEDS.find((s) => s.slug === slug);
      expect(["STANDARD", "RARITY", "DROP"], slug).not.toContain(seed?.kind);
      expect(seed?.active, slug).not.toBe(false);
      expect(Boolean(seed?.filter && isDynamicFilter(seed.filter)), slug).toBe(false);
    }
    // Un seul type par lot, 5 boosters et pas de Zeni
    for (const lot of packs.lots) expect(lot, lot.id).toMatchObject({ zeni: 0, boosters: [{ quantity: 5 }] });
  });

  it("applique -10 % sur 5 boosters, 2 achats par semaine", () => {
    const formats: Record<string, number> = { "pack-5-pochibukuro": 450, "pack-5-jubako": 2_475 };
    for (const item of packs.items) {
      expect(item.priceZeni, item.slug).toBe(formats[item.slug] ?? 900);
      expect(item.perUserLimit, item.slug).toBe(2);
      expect(item.limitPeriod, item.slug).toBe("WEEKLY");
    }
    expect(packs.items.filter((i) => i.priceZeni === 900)).toHaveLength(24);
  });

  it("donne des ids et des slugs uniques et valides, des noms d'au plus 80 caractères", () => {
    const ids = packs.lots.map((l) => l.id);
    const slugs = packs.items.map((i) => i.slug);
    expect(new Set(ids).size).toBe(26);
    expect(new Set(slugs).size).toBe(26);
    for (const id of ids) expect(id.length <= 40 && ID_PATTERN.test(id), id).toBe(true);
    for (const slug of slugs) expect(slug.length <= 40 && SLUG_PATTERN.test(slug), slug).toBe(true);
    for (const item of packs.items) {
      const lot = packs.lots.find((l) => l.id === item.lotId);
      expect(lot, item.slug).toBeDefined();
      if (!lot) continue;
      expect(lot.id).toBe(`seed-lot-pack5-${typeSlug(lot)}`);
      expect(item.slug).toBe(`pack-5-${typeSlug(lot)}`);
      expect(item.name).toEqual(lot.name);
      for (const text of [item.name.fr, item.name.en]) expect(text.length, text).toBeLessThanOrEqual(80);
    }
  });

  it("nomme les packs dans les deux langues, avec une espace insécable avant ×5", () => {
    const bySlug = new Map(packs.items.map((i) => [i.slug, i]));
    expect(bySlug.get("pack-5-shonen")?.name).toEqual({ fr: "Pack Shōnen\u00a0×5", en: "Shōnen pack\u00a0×5" });
    expect(bySlug.get("pack-5-annees-2000")?.name).toEqual({ fr: "Pack Années 2000\u00a0×5", en: "2000s pack\u00a0×5" });
    expect(bySlug.get("pack-5-jubako")?.description).toEqual({
      fr: "20 cartes, Épique garantie · 5 boosters à ouvrir quand tu veux.",
      en: "20 cards, Epic guaranteed · 5 boosters to open whenever you like.",
    });
  });

  it("range les packs par famille puis dans l'ordre des boosters, avec des rangs espacés", () => {
    const order = Object.fromEntries(packs.items.map((i) => [i.slug, i.sortOrder]));
    expect(order).toMatchObject({
      "pack-5-pochibukuro": 200,
      "pack-5-jubako": 201,
      "pack-5-shonen": 400,
      "pack-5-isekai": 500,
      "pack-5-musique": 510,
      "pack-5-waifus": 600,
      "pack-5-seconds-roles": 604,
      "pack-5-nouvelle-vague": 702,
      "pack-5-manga": 800,
    });
    expect(new Set(Object.values(order)).size).toBe(26);
  });

  it("passe les schémas de l'admin, article et lot complets", () => {
    for (const item of packs.items) {
      const parsed = shopItemInputSchema.safeParse({
        slug: item.slug,
        name: item.name,
        description: item.description,
        lotId: item.lotId,
        priceZeni: item.priceZeni,
        priceCents: null,
        stripePriceId: null,
        perUserLimit: item.perUserLimit ?? null,
        limitPeriod: item.limitPeriod ?? null,
        startsAt: null,
        endsAt: null,
        active: true,
        sortOrder: item.sortOrder,
      });
      expect(parsed.success, `${item.slug} : ${parsed.error?.message}`).toBe(true);
    }
    for (const lot of packs.lots) {
      const parsed = lotInputSchema.safeParse({
        id: lot.id,
        name: lot.name,
        zeni: lot.zeni,
        items: (lot.boosters ?? []).map((b) => ({ kind: "BOOSTER", boosterTypeId: `id-${b.slug}`, quantity: b.quantity })),
        active: true,
      });
      expect(parsed.success, `${lot.id} : ${parsed.error?.message}`).toBe(true);
    }
  });

  it("ne fait pas de pack d'un type sans prix unitaire", () => {
    const jubako = BOOSTER_SEEDS.find((s) => s.slug === "jubako");
    expect(jubako).toBeDefined();
    if (jubako) expect(shopPackSeeds([{ ...jubako, priceZeni: null }])).toEqual({ lots: [], items: [] });
  });

  it("respecte la règle de la boutique : ni sachet scellé ni Mythique garanti", () => {
    const seeds = new Map(BOOSTER_SEEDS.map((s) => [s.slug, s]));
    const definitions = BASE_RARITIES.map((key, sortOrder) => ({ key, sortOrder }));
    for (const lot of shopPackSeeds().lots) {
      const lines = (lot.boosters ?? []).map((b) => {
        const seed = seeds.get(b.slug)!;
        return { kind: "BOOSTER" as const, boosterKind: seed.kind, floors: effectiveSlotFloors(seed.slotFloors ?? [], SETTING_DEFAULTS["booster.slotFloors"]) };
      });
      expect(shopContentIssue(lines, definitions), lot.id).toBeNull();
    }
  });
});

describe("seed de l'économie", () => {
  it("crée au premier passage les lots et articles manquants, puis plus rien au suivant", async () => {
    const db = fakeDb(ALL_TYPES);
    const first = await upsertEconomySeeds(db as unknown as PrismaClient);

    // Un seul aller-retour pour tous les types, standard compris
    expect(db.boosterType.findMany).toHaveBeenCalledExactlyOnceWith({
      where: { slug: { in: expect.arrayContaining(["standard", ...EXPECTED]) } },
      select: { id: true, slug: true, kind: true, priceZeni: true },
    });
    expect(db.boosterType.findUnique).not.toHaveBeenCalled();
    const lots = createdLots(db);
    for (const lot of packs.lots) {
      expect(lots.get(lot.id), lot.id).toEqual({
        id: lot.id,
        name: lot.name,
        zeni: 0,
        items: { create: [{ kind: "BOOSTER", boosterTypeId: `id-${typeSlug(lot)}`, quantity: 5 }] },
      });
    }
    for (const item of packs.items) {
      expect(db.shopItem.create).toHaveBeenCalledWith({
        data: {
          slug: item.slug,
          name: item.name,
          description: item.description,
          lotId: item.lotId,
          priceZeni: item.priceZeni,
          perUserLimit: 2,
          limitPeriod: "WEEKLY",
          sortOrder: item.sortOrder,
        },
      });
    }
    // Les 4 articles d'origine gardent leur rang (l'Impérial à l'unité, 1 par jour, sans pack)
    expect(createdItems(db).slice(0, 4).map((i) => [i.slug, i.sortOrder])).toEqual([
      ["pack-5-standard", 0],
      ["pack-10-standard", 1],
      ["fuda-epique", 2],
      ["booster-imperial", 3],
    ]);
    expect(createdItems(db).find((i) => i.slug === "booster-imperial")).toMatchObject({ priceZeni: 3_500, perUserLimit: 1, limitPeriod: "DAILY" });
    expect(first).toEqual({ lots: lots.size, missions: MISSION_SEEDS.length, shopItems: 4 + 26, settings: 2 });
    expect(db.lot.create).toHaveBeenCalledTimes(lots.size);

    vi.clearAllMocks();
    const second = await upsertEconomySeeds(db as unknown as PrismaClient);
    expect(second).toEqual({ lots: 0, missions: 0, shopItems: 0, settings: 0 });
    for (const model of [db.lot, db.mission, db.shopItem, db.gameSetting]) expect(model.create).not.toHaveBeenCalled();
    expectNoUpdate(db);
  });

  it("ne crée ni le lot ni l'article d'un pack dont le type manque ou est scellé", async () => {
    const types = ALL_TYPES.filter((t) => t.slug !== "mecha").map((t) => (t.slug === "shonen" ? { ...t, kind: "DROP" } : t));
    const db = fakeDb(types);
    await upsertEconomySeeds(db as unknown as PrismaClient);

    const lots = createdLots(db);
    const slugs = createdItems(db).map((i) => i.slug);
    for (const type of ["mecha", "shonen"]) {
      expect(lots.has(`seed-lot-pack5-${type}`), type).toBe(false);
      expect(slugs, type).not.toContain(`pack-5-${type}`);
    }
    expect(slugs.filter((s) => /^pack-5-/.test(s) && s !== "pack-5-standard")).toHaveLength(24);
    expectNoUpdate(db);
  });

  it("crée sans booster standard les lots qui donnent des Zeni et saute ceux qui n'auraient plus rien", async () => {
    const db = fakeDb(ALL_TYPES.filter((t) => t.slug !== "standard"));
    await upsertEconomySeeds(db as unknown as PrismaClient);

    const lots = createdLots(db);
    expect(lots.get("seed-lot-daily-hard")).toMatchObject({ zeni: 200, items: { create: [] } });
    expect(lots.get("seed-lot-parrain")).toMatchObject({ zeni: 500, items: { create: [] } });
    expect(lots.get("seed-lot-semaine-decouvrir")).toMatchObject({ items: { create: [{ kind: "RARITY_CARD", rarity: "EPIC", quantity: 1 }] } });
    expect(lots.has("seed-lot-jour-rare")).toBe(false);
    expect(lots.has("seed-lot-pack-5")).toBe(false);
    expect(lots.has("seed-lot-pack5-shonen")).toBe(true);
    const slugs = createdItems(db).map((i) => i.slug);
    expect(slugs).not.toContain("pack-5-standard");
    expect(slugs).toContain("fuda-epique");
    expect(db.mission.create).not.toHaveBeenCalledWith({ data: expect.objectContaining({ key: "jour-rare" }) });
    expectNoUpdate(db);
  });

  it("ne recrée pas un pack renommé dans l'admin : son lot est déjà en vente", async () => {
    const db = fakeDb(ALL_TYPES, [{ slug: "shonen-x5-promo", lotId: "seed-lot-pack5-shonen" }]);
    await upsertEconomySeeds(db as unknown as PrismaClient);
    const slugs = createdItems(db).map((i) => i.slug);
    expect(slugs).not.toContain("pack-5-shonen");
    expect(slugs).toContain("pack-5-seinen");
    expectNoUpdate(db);
  });

  it("calcule le prix d'un pack sur le prix unitaire en base, et saute un type sans prix", async () => {
    const types = ALL_TYPES.map((t) => (t.slug === "shonen" ? { ...t, priceZeni: 150 } : t.slug === "seinen" ? { ...t, priceZeni: null } : t));
    const db = fakeDb(types);
    await upsertEconomySeeds(db as unknown as PrismaClient);
    const items = new Map(createdItems(db).map((i) => [i.slug, i as ItemData & { priceZeni: number }]));
    expect(items.get("pack-5-shonen")?.priceZeni).toBe(675);
    expect(items.has("pack-5-seinen")).toBe(false);
    expect(items.get("pack-5-mecha")?.priceZeni).toBe(900);
    expect(items.get("pack-5-jubako")?.priceZeni).toBe(2475);
  });

  it("le seed des missions ne crée que leurs lots, sans pack ni article", async () => {
    const db = fakeDb(ALL_TYPES);
    const result = await upsertMissionSeeds(db as unknown as PrismaClient);

    const lots = createdLots(db);
    expect(sorted([...lots.keys()])).toEqual(sorted([...new Set(MISSION_SEEDS.map((m) => m.lotId))]));
    expect(result).toEqual({ lots: lots.size, missions: MISSION_SEEDS.length });
    expect(db.boosterType.findMany).toHaveBeenCalledOnce();
    expect(db.shopItem.create).not.toHaveBeenCalled();
    expectNoUpdate(db);
  });
});
