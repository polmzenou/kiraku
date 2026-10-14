import type { PrismaClient } from "../../generated/prisma/client.ts";
import type { Localized } from "../../lib/boosters/types.ts";
import type { Rarity } from "../../lib/catalog/rarity.ts";
import type { MissionMetric, MissionPeriod } from "../../lib/economy/missions.ts";
import type { ShopLimitPeriod } from "../../lib/economy/shop.ts";

// Économie de départ (étape 7) : lots, missions, articles de boutique et lots du parrainage.
// Valeurs de départ seulement : le seed ne crée que ce qui manque, tout se règle ensuite dans
// /admin (lots, missions, boutique, économie). Repère : un booster standard vaut 200 Zeni.

type LotSeed = {
  id: string;
  name: Localized;
  zeni: number;
  standardBoosters?: number;
  rarityCard?: Rarity;
};

const LOTS: LotSeed[] = [
  { id: "seed-lot-jour-visite", name: { fr: "Bonjour du jour", en: "Daily hello" }, zeni: 50 },
  { id: "seed-lot-jour-ouvrir", name: { fr: "Petit sac de Zeni", en: "Small Zeni pouch" }, zeni: 100 },
  { id: "seed-lot-jour-rare", name: { fr: "Un sachet offert", en: "A free booster" }, zeni: 0, standardBoosters: 1 },
  { id: "seed-lot-semaine-ouvrir", name: { fr: "Coffre de la semaine", en: "Weekly chest" }, zeni: 500, standardBoosters: 2 },
  { id: "seed-lot-semaine-decouvrir", name: { fr: "Fuda épique", en: "Epic fuda" }, zeni: 0, rarityCard: "EPIC" },
  { id: "seed-lot-parrain", name: { fr: "Merci du parrainage", en: "Thanks for referring" }, zeni: 500, standardBoosters: 3 },
  { id: "seed-lot-filleul", name: { fr: "Cadeau de bienvenue", en: "Welcome gift" }, zeni: 300, standardBoosters: 2 },
  { id: "seed-lot-pack-5", name: { fr: "5 boosters standard", en: "5 standard boosters" }, zeni: 0, standardBoosters: 5 },
  { id: "seed-lot-pack-10", name: { fr: "10 boosters standard", en: "10 standard boosters" }, zeni: 0, standardBoosters: 10 },
  { id: "seed-lot-epique", name: { fr: "Une fuda épique", en: "One epic fuda" }, zeni: 0, rarityCard: "EPIC" },
];

type MissionSeed = { key: string; period: MissionPeriod; metric: MissionMetric; goal: number; rarity?: Rarity; lotId: string };

const MISSIONS: MissionSeed[] = [
  { key: "jour-visite", period: "DAILY", metric: "VISIT", goal: 1, lotId: "seed-lot-jour-visite" },
  { key: "jour-ouvrir-5", period: "DAILY", metric: "OPEN_BOOSTERS", goal: 5, lotId: "seed-lot-jour-ouvrir" },
  { key: "jour-rare", period: "DAILY", metric: "PULL_RARITY", goal: 1, rarity: "RARE", lotId: "seed-lot-jour-rare" },
  { key: "semaine-ouvrir-40", period: "WEEKLY", metric: "OPEN_BOOSTERS", goal: 40, lotId: "seed-lot-semaine-ouvrir" },
  { key: "semaine-decouvrir-20", period: "WEEKLY", metric: "DISCOVER_CARDS", goal: 20, lotId: "seed-lot-semaine-decouvrir" },
];

type ShopSeed = {
  slug: string;
  name: Localized;
  description: Localized;
  lotId: string;
  priceZeni: number;
  perUserLimit?: number;
  limitPeriod?: ShopLimitPeriod;
};

const SHOP: ShopSeed[] = [
  {
    slug: "pack-5-standard",
    name: { fr: "Pack de 5 boosters", en: "5-booster pack" },
    description: { fr: "Cinq boosters standard à ouvrir quand tu veux.", en: "Five standard boosters to open whenever you like." },
    lotId: "seed-lot-pack-5",
    priceZeni: 900,
  },
  {
    slug: "pack-10-standard",
    name: { fr: "Pack de 10 boosters", en: "10-booster pack" },
    description: { fr: "Dix boosters standard, à prix doux.", en: "Ten standard boosters at a gentle price." },
    lotId: "seed-lot-pack-10",
    priceZeni: 1_700,
    perUserLimit: 3,
    limitPeriod: "WEEKLY",
  },
  {
    slug: "fuda-epique",
    name: { fr: "Fuda épique", en: "Epic fuda" },
    description: { fr: "Une carte Épique tirée au hasard.", en: "One random Epic card." },
    lotId: "seed-lot-epique",
    priceZeni: 2_500,
    perUserLimit: 1,
    limitPeriod: "DAILY",
  },
];

export async function upsertEconomySeeds(db: PrismaClient) {
  const standard = await db.boosterType.findUnique({ where: { slug: "standard" }, select: { id: true } });
  const created = { lots: 0, missions: 0, shopItems: 0, settings: 0 };

  for (const lot of LOTS) {
    if (await db.lot.findUnique({ where: { id: lot.id }, select: { id: true } })) continue;
    const items = [
      ...(lot.standardBoosters && standard
        ? [{ kind: "BOOSTER" as const, boosterTypeId: standard.id, quantity: lot.standardBoosters }]
        : []),
      ...(lot.rarityCard ? [{ kind: "RARITY_CARD" as const, rarity: lot.rarityCard, quantity: 1 }] : []),
    ];
    // Sans booster standard en base, un lot qui n'aurait plus rien à donner n'est pas créé
    if (lot.zeni === 0 && items.length === 0) continue;
    await db.lot.create({ data: { id: lot.id, name: lot.name, zeni: lot.zeni, items: { create: items } } });
    created.lots++;
  }
  const lotIds = new Set((await db.lot.findMany({ select: { id: true } })).map((l) => l.id));

  for (const [i, m] of MISSIONS.entries()) {
    if (!lotIds.has(m.lotId) || (await db.mission.findUnique({ where: { key: m.key }, select: { id: true } }))) continue;
    await db.mission.create({
      data: { key: m.key, period: m.period, metric: m.metric, goal: m.goal, rarity: m.rarity ?? null, lotId: m.lotId, sortOrder: i },
    });
    created.missions++;
  }

  for (const [i, s] of SHOP.entries()) {
    if (!lotIds.has(s.lotId) || (await db.shopItem.findUnique({ where: { slug: s.slug }, select: { id: true } }))) continue;
    await db.shopItem.create({
      data: {
        slug: s.slug,
        name: s.name,
        description: s.description,
        lotId: s.lotId,
        priceZeni: s.priceZeni,
        perUserLimit: s.perUserLimit ?? null,
        limitPeriod: s.limitPeriod ?? null,
        sortOrder: i,
      },
    });
    created.shopItems++;
  }

  // Lots du parrainage : posés seulement si l'admin n'a encore rien choisi
  for (const [key, lotId] of [
    ["referral.referrerLotId", "seed-lot-parrain"],
    ["referral.refereeLotId", "seed-lot-filleul"],
  ] as const) {
    if (!lotIds.has(lotId) || (await db.gameSetting.findUnique({ where: { key }, select: { key: true } }))) continue;
    await db.gameSetting.create({ data: { key, value: lotId, updatedBy: null } });
    created.settings++;
  }
  return created;
}
