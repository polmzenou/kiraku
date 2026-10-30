import type { PrismaClient } from "../../generated/prisma/client.ts";
import { isDynamicFilter } from "../../lib/boosters/pool-filter.ts";
import { BOOSTER_FAMILIES, type Localized } from "../../lib/boosters/types.ts";
import type { Rarity } from "../../lib/catalog/rarity.ts";
import type { MissionMetric, MissionPeriod } from "../../lib/economy/missions.ts";
import type { ShopLimitPeriod } from "../../lib/economy/shop.ts";
import { BOOSTER_SEEDS, type BoosterSeed } from "./booster-types.ts";

// Économie de départ (étape 7) : lots, missions, articles de boutique et lots du parrainage.
// Valeurs de départ seulement : le seed ne crée que ce qui manque, tout se règle ensuite dans
// /admin (lots, missions, boutique, économie). Repère : un booster standard vaut 200 Zeni.

type LotSeed = {
  id: string;
  name: Localized;
  zeni: number;
  standardBoosters?: number;
  rarityCard?: Rarity;
  /** Boosters d'un type précis (packs de la boutique) : s'il en manque un, le lot n'est pas créé. */
  boosters?: { slug: string; quantity: number }[];
};

const LOTS: LotSeed[] = [
  { id: "seed-lot-daily-easy", name: { fr: "Mission du jour · Facile", en: "Daily mission · Easy" }, zeni: 60 },
  { id: "seed-lot-daily-medium", name: { fr: "Mission du jour · Intermédiaire", en: "Daily mission · Medium" }, zeni: 120 },
  { id: "seed-lot-daily-hard", name: { fr: "Défi du jour", en: "Daily challenge" }, zeni: 200, standardBoosters: 1 },
  { id: "seed-lot-weekly-easy", name: { fr: "Mission de la semaine · Facile", en: "Weekly mission · Easy" }, zeni: 200 },
  { id: "seed-lot-weekly-medium", name: { fr: "Mission de la semaine · Intermédiaire", en: "Weekly mission · Medium" }, zeni: 400, standardBoosters: 1 },
  { id: "seed-lot-weekly-hard", name: { fr: "Défi de la semaine", en: "Weekly challenge" }, zeni: 800, standardBoosters: 2 },
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
  { id: "seed-lot-imperial", name: { fr: "Un booster Impérial", en: "One Imperial booster" }, zeni: 0, boosters: [{ slug: "imperial", quantity: 1 }] },
  // Paliers du parrainage (amis qualifiés depuis toujours) : de plus en plus rares
  { id: "seed-lot-palier-3", name: { fr: "Un Jūbako", en: "One Jūbako" }, zeni: 0, boosters: [{ slug: "jubako", quantity: 1 }] },
  { id: "seed-lot-palier-6", name: { fr: "Un booster Impérial", en: "One Imperial booster" }, zeni: 0, boosters: [{ slug: "imperial", quantity: 1 }] },
  { id: "seed-lot-palier-10", name: { fr: "Un booster Mythique", en: "One Mythic booster" }, zeni: 0, boosters: [{ slug: "mythique", quantity: 1 }] },
  { id: "seed-lot-palier-20", name: { fr: "Deux boosters Mythiques", en: "Two Mythic boosters" }, zeni: 0, boosters: [{ slug: "mythique", quantity: 2 }] },
];

/** Paliers du parrainage : nombre d'amis qualifiés → lot (réglage referral.milestones). */
export const REFERRAL_MILESTONE_SEEDS = [
  { referrals: 3, lotId: "seed-lot-palier-3" },
  { referrals: 6, lotId: "seed-lot-palier-6" },
  { referrals: 10, lotId: "seed-lot-palier-10" },
  { referrals: 20, lotId: "seed-lot-palier-20" },
];

type MissionSeed = { key: string; period: MissionPeriod; metric: MissionMetric; goal: number; rarity?: Rarity; lotId: string };

export const MISSION_SEEDS: MissionSeed[] = [
  { key: "jour-visite", period: "DAILY", metric: "VISIT", goal: 1, lotId: "seed-lot-jour-visite" },
  { key: "jour-ouvrir-5", period: "DAILY", metric: "OPEN_BOOSTERS", goal: 5, lotId: "seed-lot-jour-ouvrir" },
  { key: "jour-rare", period: "DAILY", metric: "PULL_RARITY", goal: 1, rarity: "RARE", lotId: "seed-lot-jour-rare" },
  { key: "semaine-ouvrir-40", period: "WEEKLY", metric: "OPEN_BOOSTERS", goal: 40, lotId: "seed-lot-semaine-ouvrir" },
  { key: "semaine-decouvrir-20", period: "WEEKLY", metric: "DISCOVER_CARDS", goal: 20, lotId: "seed-lot-semaine-decouvrir" },
  // Quotidiennes : les objectifs faciles se font en une courte session.
  { key: "jour-ouvrir-3", period: "DAILY", metric: "OPEN_BOOSTERS", goal: 3, lotId: "seed-lot-daily-easy" },
  { key: "jour-peu-communes-3", period: "DAILY", metric: "PULL_RARITY", goal: 3, rarity: "UNCOMMON", lotId: "seed-lot-daily-easy" },
  { key: "jour-decouvrir-3", period: "DAILY", metric: "DISCOVER_CARDS", goal: 3, lotId: "seed-lot-daily-easy" },
  { key: "jour-recycler-20", period: "DAILY", metric: "RECYCLE_ZENI", goal: 20, lotId: "seed-lot-daily-easy" },
  { key: "jour-depenser-200", period: "DAILY", metric: "SPEND_ZENI", goal: 200, lotId: "seed-lot-daily-easy" },
  { key: "jour-ami-1", period: "DAILY", metric: "ADD_FRIENDS", goal: 1, lotId: "seed-lot-daily-easy" },
  { key: "jour-ouvrir-10", period: "DAILY", metric: "OPEN_BOOSTERS", goal: 10, lotId: "seed-lot-daily-medium" },
  { key: "jour-rares-5", period: "DAILY", metric: "PULL_RARITY", goal: 5, rarity: "RARE", lotId: "seed-lot-daily-medium" },
  { key: "jour-epique-1", period: "DAILY", metric: "PULL_RARITY", goal: 1, rarity: "EPIC", lotId: "seed-lot-daily-medium" },
  { key: "jour-decouvrir-8", period: "DAILY", metric: "DISCOVER_CARDS", goal: 8, lotId: "seed-lot-daily-medium" },
  { key: "jour-recycler-75", period: "DAILY", metric: "RECYCLE_ZENI", goal: 75, lotId: "seed-lot-daily-medium" },
  { key: "jour-depenser-600", period: "DAILY", metric: "SPEND_ZENI", goal: 600, lotId: "seed-lot-daily-medium" },
  { key: "jour-cadeau-1", period: "DAILY", metric: "SEND_GIFTS", goal: 1, lotId: "seed-lot-daily-medium" },
  { key: "jour-ouvrir-20", period: "DAILY", metric: "OPEN_BOOSTERS", goal: 20, lotId: "seed-lot-daily-hard" },
  { key: "jour-epiques-3", period: "DAILY", metric: "PULL_RARITY", goal: 3, rarity: "EPIC", lotId: "seed-lot-daily-hard" },
  { key: "jour-decouvrir-18", period: "DAILY", metric: "DISCOVER_CARDS", goal: 18, lotId: "seed-lot-daily-hard" },
  { key: "jour-recycler-200", period: "DAILY", metric: "RECYCLE_ZENI", goal: 200, lotId: "seed-lot-daily-hard" },
  { key: "jour-depenser-1500", period: "DAILY", metric: "SPEND_ZENI", goal: 1_500, lotId: "seed-lot-daily-hard" },
  { key: "jour-cadeaux-3", period: "DAILY", metric: "SEND_GIFTS", goal: 3, lotId: "seed-lot-daily-hard" },
  // Hebdomadaires : davantage de régularité, sans demander de rareté mythique.
  { key: "semaine-ouvrir-15", period: "WEEKLY", metric: "OPEN_BOOSTERS", goal: 15, lotId: "seed-lot-weekly-easy" },
  { key: "semaine-rares-10", period: "WEEKLY", metric: "PULL_RARITY", goal: 10, rarity: "RARE", lotId: "seed-lot-weekly-easy" },
  { key: "semaine-decouvrir-8", period: "WEEKLY", metric: "DISCOVER_CARDS", goal: 8, lotId: "seed-lot-weekly-easy" },
  { key: "semaine-recycler-100", period: "WEEKLY", metric: "RECYCLE_ZENI", goal: 100, lotId: "seed-lot-weekly-easy" },
  { key: "semaine-depenser-800", period: "WEEKLY", metric: "SPEND_ZENI", goal: 800, lotId: "seed-lot-weekly-easy" },
  { key: "semaine-cadeaux-2", period: "WEEKLY", metric: "SEND_GIFTS", goal: 2, lotId: "seed-lot-weekly-easy" },
  { key: "semaine-ami-1", period: "WEEKLY", metric: "ADD_FRIENDS", goal: 1, lotId: "seed-lot-weekly-easy" },
  { key: "semaine-epiques-3", period: "WEEKLY", metric: "PULL_RARITY", goal: 3, rarity: "EPIC", lotId: "seed-lot-weekly-medium" },
  { key: "semaine-recycler-400", period: "WEEKLY", metric: "RECYCLE_ZENI", goal: 400, lotId: "seed-lot-weekly-medium" },
  { key: "semaine-depenser-2500", period: "WEEKLY", metric: "SPEND_ZENI", goal: 2_500, lotId: "seed-lot-weekly-medium" },
  { key: "semaine-cadeaux-6", period: "WEEKLY", metric: "SEND_GIFTS", goal: 6, lotId: "seed-lot-weekly-medium" },
  { key: "semaine-amis-3", period: "WEEKLY", metric: "ADD_FRIENDS", goal: 3, lotId: "seed-lot-weekly-medium" },
  { key: "semaine-ouvrir-120", period: "WEEKLY", metric: "OPEN_BOOSTERS", goal: 120, lotId: "seed-lot-weekly-hard" },
  { key: "semaine-legendaire-1", period: "WEEKLY", metric: "PULL_RARITY", goal: 1, rarity: "LEGENDARY", lotId: "seed-lot-weekly-hard" },
  { key: "semaine-decouvrir-60", period: "WEEKLY", metric: "DISCOVER_CARDS", goal: 60, lotId: "seed-lot-weekly-hard" },
  { key: "semaine-recycler-1000", period: "WEEKLY", metric: "RECYCLE_ZENI", goal: 1_000, lotId: "seed-lot-weekly-hard" },
  { key: "semaine-depenser-6000", period: "WEEKLY", metric: "SPEND_ZENI", goal: 6_000, lotId: "seed-lot-weekly-hard" },
  { key: "semaine-cadeaux-12", period: "WEEKLY", metric: "SEND_GIFTS", goal: 12, lotId: "seed-lot-weekly-hard" },
];

type ShopSeed = {
  slug: string;
  name: Localized;
  description: Localized;
  lotId: string;
  priceZeni: number;
  perUserLimit?: number;
  limitPeriod?: ShopLimitPeriod;
  /** Absent = rang dans la liste. */
  sortOrder?: number;
  /** Pack d'un type : son prix est recalculé à la création sur le prix unitaire en base. */
  pack?: { slug: string; quantity: number };
};

const SHOP: ShopSeed[] = [
  {
    slug: "pack-5-standard",
    name: { fr: "Pack de 5 boosters", en: "5-booster pack" },
    description: { fr: "Cinq boosters standard à ouvrir quand tu veux.", en: "Five standard boosters to open whenever you like." },
    lotId: "seed-lot-pack-5",
    priceZeni: 900,
    perUserLimit: 100,
    limitPeriod: "DAILY",
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
  {
    // Exclusif boutique (type PRESTIGE) : rangé dans « Fuda et extras »
    slug: "booster-imperial",
    name: { fr: "Booster Impérial", en: "Imperial booster" },
    description: {
      fr: "Cinq cartes, Légendaire et mieux ×2,7. Compte pour la pitié et le sachet doré.",
      en: "Five cards, Legendary and up ×2.7. Counts towards pity and the golden booster.",
    },
    lotId: "seed-lot-imperial",
    priceZeni: 3_500,
    perUserLimit: 1,
    limitPeriod: "DAILY",
  },
];

// Packs ×5 à -10 %, 2 par semaine. Valeurs de départ seulement, réglables ensuite dans /admin/boutique
// (le prix finit dans ShopItem.priceZeni).
const PACK_QUANTITY = 5;
const PACK_DISCOUNT = 0.1;
const PACK_WEEKLY_LIMIT = 2;

/** Prix d'un pack à partir du prix unitaire du type ; null sans prix (le pack serait gratuit). */
function packPrice(unitPrice: number | null | undefined, quantity: number): number | null {
  return unitPrice ? Math.round(quantity * unitPrice * (1 - PACK_DISCOUNT)) : null;
}

/**
 * Types vendus en pack : les formats et les types gratuits de base actifs, sauf ceux dont le pool change
 * chaque jour (un crédit s'ouvre avec le pool du jour où on l'ouvre). Ni standard, ni rareté, ni scellé.
 */
function sellsAsPack(s: BoosterSeed): boolean {
  if (s.kind === "FORMAT") return true;
  // L'Impérial se vend à l'unité, une fois par jour : pas de pack
  return (
    s.usesFreeStock !== false &&
    s.kind !== "STANDARD" &&
    s.kind !== "DROP" &&
    s.kind !== "PRESTIGE" &&
    s.active !== false &&
    !(s.filter && isDynamicFilter(s.filter))
  );
}

/** Lots et articles des packs, un par type vendu, rangés comme la page des boosters (famille × 100 + rang). */
export function shopPackSeeds(seeds: readonly BoosterSeed[] = BOOSTER_SEEDS): { lots: LotSeed[]; items: ShopSeed[] } {
  const lots: LotSeed[] = [];
  const items: ShopSeed[] = [];
  const order = new Map<string, number>();
  for (const s of seeds) {
    // Sans prix unitaire, le pack serait gratuit
    if (!sellsAsPack(s) || !s.priceZeni) continue;
    const rank = order.get(s.family) ?? 0;
    order.set(s.family, rank + 1);
    const lotId = `seed-lot-pack${PACK_QUANTITY}-${s.slug}`;
    const name = {
      fr: `Pack ${s.name.fr}\u00a0×${PACK_QUANTITY}`,
      en: `${s.name.en.replace(/^The /, "")} pack\u00a0×${PACK_QUANTITY}`,
    };
    lots.push({ id: lotId, name, zeni: 0, boosters: [{ slug: s.slug, quantity: PACK_QUANTITY }] });
    items.push({
      slug: `pack-${PACK_QUANTITY}-${s.slug}`,
      name,
      description: {
        fr: `${s.tagline.fr} · ${PACK_QUANTITY} boosters à ouvrir quand tu veux.`,
        en: `${s.tagline.en} · ${PACK_QUANTITY} boosters to open whenever you like.`,
      },
      lotId,
      // Prix de départ ; à la création, recalculé sur le prix unitaire en base (réglé dans l'admin)
      priceZeni: packPrice(s.priceZeni, PACK_QUANTITY)!,
      pack: { slug: s.slug, quantity: PACK_QUANTITY },
      perUserLimit: PACK_WEEKLY_LIMIT,
      limitPeriod: "WEEKLY",
      sortOrder: (BOOSTER_FAMILIES.indexOf(s.family) + 1) * 100 + rank,
    });
  }
  return { lots, items };
}

async function upsertLots(db: PrismaClient, lots: readonly LotSeed[]) {
  // Un seul aller-retour pour tous les types cités, standard compris
  const slugs = [...new Set(["standard", ...lots.flatMap((lot) => (lot.boosters ?? []).map((b) => b.slug))])];
  const types = new Map(
    (
      await db.boosterType.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true, kind: true, priceZeni: true } })
    ).map((t) => [t.slug, t]),
  );
  const standard = types.get("standard");
  let created = 0;
  for (const lot of lots) {
    if (await db.lot.findUnique({ where: { id: lot.id }, select: { id: true } })) continue;
    const boosters = (lot.boosters ?? []).flatMap((b) => {
      const type = types.get(b.slug);
      return type && type.kind !== "DROP" ? [{ kind: "BOOSTER" as const, boosterTypeId: type.id, quantity: b.quantity }] : [];
    });
    // Jamais de pack amputé d'un booster (type absent ou sachet scellé) : son article est alors sauté
    if (boosters.length < (lot.boosters?.length ?? 0)) continue;
    const items = [
      ...(lot.standardBoosters && standard
        ? [{ kind: "BOOSTER" as const, boosterTypeId: standard.id, quantity: lot.standardBoosters }]
        : []),
      ...boosters,
      ...(lot.rarityCard ? [{ kind: "RARITY_CARD" as const, rarity: lot.rarityCard, quantity: 1 }] : []),
    ];
    // Sans booster standard en base, un lot qui n'aurait plus rien à donner n'est pas créé
    if (lot.zeni === 0 && items.length === 0) continue;
    await db.lot.create({ data: { id: lot.id, name: lot.name, zeni: lot.zeni, items: { create: items } } });
    created++;
  }
  return { created, types };
}

async function upsertMissions(db: PrismaClient) {
  const lotIds = new Set((await db.lot.findMany({ select: { id: true } })).map((l) => l.id));
  let created = 0;
  for (const [i, m] of MISSION_SEEDS.entries()) {
    if (!lotIds.has(m.lotId) || (await db.mission.findUnique({ where: { key: m.key }, select: { id: true } }))) continue;
    await db.mission.create({
      data: { key: m.key, period: m.period, metric: m.metric, goal: m.goal, rarity: m.rarity ?? null, lotId: m.lotId, sortOrder: i },
    });
    created++;
  }
  return created;
}

/** Ajout du catalogue de missions et de ses lots, sans modifier les réglages existants. */
export async function upsertMissionSeeds(db: PrismaClient) {
  const wanted = new Set(MISSION_SEEDS.map((m) => m.lotId));
  const { created: lots } = await upsertLots(db, LOTS.filter((lot) => wanted.has(lot.id)));
  return { lots, missions: await upsertMissions(db) };
}

export async function upsertEconomySeeds(db: PrismaClient) {
  const packs = shopPackSeeds();
  const { created: lots, types } = await upsertLots(db, [...LOTS, ...packs.lots]);
  const created = { lots, missions: await upsertMissions(db), shopItems: 0, settings: 0 };
  const lotIds = new Set((await db.lot.findMany({ select: { id: true } })).map((l) => l.id));

  for (const [i, s] of [...SHOP, ...packs.items].entries()) {
    if (!lotIds.has(s.lotId)) continue;
    // Pack : prix sur le prix unitaire en base, qui peut différer de la valeur de départ des seeds
    const priceZeni = s.pack ? packPrice(types.get(s.pack.slug)?.priceZeni, s.pack.quantity) : s.priceZeni;
    if (priceZeni === null) continue;
    // Déjà en vente, même renommé dans l'admin (le slug se modifie, le lot du seed reste le même)
    if (await db.shopItem.findFirst({ where: { OR: [{ slug: s.slug }, { lotId: s.lotId }] }, select: { id: true } })) continue;
    await db.shopItem.create({
      data: {
        slug: s.slug,
        name: s.name,
        description: s.description,
        lotId: s.lotId,
        priceZeni,
        perUserLimit: s.perUserLimit ?? null,
        limitPeriod: s.limitPeriod ?? null,
        sortOrder: s.sortOrder ?? i,
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

  // Paliers : posés une fois, avec les seuls lots créés (un type de booster absent saute son palier)
  const milestones = REFERRAL_MILESTONE_SEEDS.filter((m) => lotIds.has(m.lotId));
  const milestonesKey = "referral.milestones";
  if (milestones.length > 0 && !(await db.gameSetting.findUnique({ where: { key: milestonesKey }, select: { key: true } }))) {
    await db.gameSetting.create({ data: { key: milestonesKey, value: milestones, updatedBy: null } });
    created.settings++;
  }
  return created;
}
