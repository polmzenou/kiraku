import type { PrismaClient } from "../../generated/prisma/client.ts";
import type { Localized } from "../../lib/boosters/types.ts";
import { SETTING_DEFAULTS } from "../../lib/settings/defaults.ts";

// Parrainage v2 (étape 18) : lots à identifiant fixe des étapes, de la part « confiance », des paliers, du
// grand-parrainage et de l'Ennichi (paliers de lanternes, banzuke, omikuji), montants choisis le 2026-11-23
// (docs/PLAN.md), et réglages qui les désignent. Comme le seed de l'économie, rien n'est écrasé : un lot existant est
// gardé, un réglage déjà choisi dans l'admin n'est pas touché. Les Divins sont des sachets scellés (type DROP), versés
// un par un par grantLot. Un lot dont un type de booster manque n'est pas créé, et son emplacement reste vide (null)
// dans les réglages.

type LotSeed = { id: string; name: Localized; zeni: number; boosters: { slug: string; quantity: number }[] };

const lot = (id: string, fr: string, en: string, zeni: number, boosters: Record<string, number>): LotSeed => ({
  id,
  name: { fr, en },
  zeni,
  boosters: Object.entries(boosters).map(([slug, quantity]) => ({ slug, quantity })),
});

export const REFERRAL_V2_LOTS: LotSeed[] = [
  lot("seed-lot-pv2-e1-filleul", "Parrainage · Arrivée (filleul)", "Referral · Arrival (friend)", 0, { standard: 20, jubako: 1 }),
  lot("seed-lot-pv2-e1-parrain", "Parrainage · Arrivée (parrain)", "Referral · Arrival (referrer)", 0, { standard: 5 }),
  lot("seed-lot-pv2-e1-confiance", "Parrainage · Arrivée, part confiance", "Referral · Arrival, trust share", 0, { mythique: 1 }),
  lot("seed-lot-pv2-e2-filleul", "Parrainage · Installé (filleul)", "Referral · Settled (friend)", 2_000, { mythique: 2, standard: 10 }),
  lot("seed-lot-pv2-e2-parrain", "Parrainage · Installé (parrain)", "Referral · Settled (referrer)", 1_000, { jubako: 2 }),
  lot("seed-lot-pv2-e2-confiance", "Parrainage · Installé, part confiance", "Referral · Settled, trust share", 0, { mythique: 1 }),
  lot("seed-lot-pv2-e3-filleul", "Parrainage · Accro (filleul)", "Referral · Hooked (friend)", 0, { divin: 1, mythique: 1, standard: 10 }),
  lot("seed-lot-pv2-e3-parrain", "Parrainage · Accro (parrain)", "Referral · Hooked (referrer)", 0, { divin: 1, standard: 5 }),
  lot("seed-lot-pv2-e4-filleul", "Parrainage · Fidèle (filleul)", "Referral · Loyal (friend)", 0, { divin: 2, mythique: 1 }),
  lot("seed-lot-pv2-e4-parrain", "Parrainage · Fidèle (parrain)", "Referral · Loyal (referrer)", 0, { divin: 2 }),
  lot("seed-lot-pv2-palier-3", "Parrainage · Palier de 3 amis", "Referral · 3 friends milestone", 0, { divin: 1 }),
  lot("seed-lot-pv2-palier-10", "Parrainage · Palier de 10 amis", "Referral · 10 friends milestone", 0, { mythique: 1, divin: 2 }),
  lot("seed-lot-pv2-grand", "Parrainage · Grand-parrain", "Referral · Grand-referrer", 0, { imperial: 1, jubako: 1 }),
  // Ennichi : lots de chaque palier de lanternes, pour chaque joueur (le 4e palier ajoute 1 Mythique au choix, en bon)
  lot("seed-lot-enn-palier-1", "Ennichi · Lanternes, palier 一", "Ennichi · Lanterns, tier 1", 0, { standard: 30, jubako: 2 }),
  lot("seed-lot-enn-palier-2", "Ennichi · Lanternes, palier 二", "Ennichi · Lanterns, tier 2", 0, { standard: 50, imperial: 2, mythique: 1 }),
  lot("seed-lot-enn-palier-3", "Ennichi · Lanternes, palier 三", "Ennichi · Lanterns, tier 3", 0, { standard: 80, mythique: 3, divin: 1 }),
  lot("seed-lot-enn-palier-4", "Ennichi · Lanternes, palier 四", "Ennichi · Lanterns, tier 4", 0, { standard: 250, divin: 3 }),
  // Banzuke, du 11e au 50e ; cagnotte de l'omikuji (la carte 1/1 est un bon)
  lot("seed-lot-enn-rang-11-50", "Ennichi · Banzuke, 11e à 50e", "Ennichi · Banzuke, 11th to 50th", 0, { divin: 1 }),
  lot("seed-lot-enn-omikuji-divin", "Ennichi · Omikuji, Divin", "Ennichi · Omikuji, Divine", 0, { divin: 1 }),
  lot("seed-lot-enn-omikuji-mythique", "Ennichi · Omikuji, booster Mythique", "Ennichi · Omikuji, Mythic booster", 0, { mythique: 1 }),
];

/** Lots de chaque étape : filleul, parrain, part « confiance » du parrain (étapes 1 et 2). */
export const REFERRAL_V2_STEP_LOTS = [
  ["seed-lot-pv2-e1-filleul", "seed-lot-pv2-e1-parrain", "seed-lot-pv2-e1-confiance"],
  ["seed-lot-pv2-e2-filleul", "seed-lot-pv2-e2-parrain", "seed-lot-pv2-e2-confiance"],
  ["seed-lot-pv2-e3-filleul", "seed-lot-pv2-e3-parrain", null],
  ["seed-lot-pv2-e4-filleul", "seed-lot-pv2-e4-parrain", null],
] as const;

export const REFERRAL_V2_MILESTONE_LOTS: Record<number, string> = { 3: "seed-lot-pv2-palier-3", 10: "seed-lot-pv2-palier-10" };
export const REFERRAL_V2_GRAND_LOT = "seed-lot-pv2-grand";
export const ENNICHI_TIER_LOTS = ["seed-lot-enn-palier-1", "seed-lot-enn-palier-2", "seed-lot-enn-palier-3", "seed-lot-enn-palier-4"] as const;
export const ENNICHI_RANK_LOTS: Record<number, string> = { 11: "seed-lot-enn-rang-11-50" };
/** Lots de la cagnotte par ligne (la ligne 0 est la carte 1/1, un bon). */
export const ENNICHI_POOL_LOTS: Record<number, string> = { 1: "seed-lot-enn-omikuji-divin", 2: "seed-lot-enn-omikuji-mythique" };

async function upsertLots(db: PrismaClient): Promise<{ created: number; ids: Set<string> }> {
  const slugs = [...new Set(REFERRAL_V2_LOTS.flatMap((l) => l.boosters.map((b) => b.slug)))];
  const types = new Map((await db.boosterType.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } })).map((t) => [t.slug, t.id]));
  let created = 0;
  for (const seed of REFERRAL_V2_LOTS) {
    if (await db.lot.findUnique({ where: { id: seed.id }, select: { id: true } })) continue;
    const items = seed.boosters.flatMap((b) => (types.has(b.slug) ? [{ kind: "BOOSTER" as const, boosterTypeId: types.get(b.slug)!, quantity: b.quantity }] : []));
    // Jamais de lot amputé : un type absent saute le lot (son emplacement reste vide dans les réglages)
    if (items.length < seed.boosters.length) continue;
    await db.lot.create({ data: { id: seed.id, name: seed.name, zeni: seed.zeni, items: { create: items } } });
    created++;
  }
  const ids = new Set((await db.lot.findMany({ where: { id: { in: REFERRAL_V2_LOTS.map((l) => l.id) } }, select: { id: true } })).map((l) => l.id));
  return { created, ids };
}

/** Réglage posé seulement s'il est absent (jamais un choix fait dans l'admin). */
async function setIfAbsent(db: PrismaClient, key: string, value: unknown): Promise<boolean> {
  if (await db.gameSetting.findUnique({ where: { key }, select: { key: true } })) return false;
  await db.gameSetting.create({ data: { key, value: value as never, updatedBy: null } });
  return true;
}

export async function upsertReferralV2Seeds(db: PrismaClient): Promise<{ lots: number; settings: number }> {
  const { created, ids } = await upsertLots(db);
  const have = (id: string | null) => (id && ids.has(id) ? id : null);
  let settings = 0;
  const stepLots = REFERRAL_V2_STEP_LOTS.map(([referee, referrer, trust]) => ({ referee: have(referee), referrer: have(referrer), referrerTrust: have(trust) }));
  if (await setIfAbsent(db, "referral.v2.stepLots", stepLots)) settings++;
  if (have(REFERRAL_V2_GRAND_LOT) && (await setIfAbsent(db, "referral.v2.grandLotId", REFERRAL_V2_GRAND_LOT))) settings++;
  const milestones = SETTING_DEFAULTS["referral.v2.milestones"].map((m) => ({ ...m, lotId: have(REFERRAL_V2_MILESTONE_LOTS[m.installed] ?? null) ?? m.lotId }));
  if (await setIfAbsent(db, "referral.v2.milestones", milestones)) settings++;
  // Ennichi : paliers, rangs et cagnotte avec leurs lots (seuils et bons des valeurs par défaut)
  const tiers = SETTING_DEFAULTS["ennichi.tiers"].map((t, i) => ({ ...t, lotId: have(ENNICHI_TIER_LOTS[i] ?? null) ?? t.lotId }));
  if (await setIfAbsent(db, "ennichi.tiers", tiers)) settings++;
  const ranks = SETTING_DEFAULTS["ennichi.ranks"].map((r) => ({ ...r, lotId: have(ENNICHI_RANK_LOTS[r.from] ?? null) ?? r.lotId }));
  if (await setIfAbsent(db, "ennichi.ranks", ranks)) settings++;
  const pool = SETTING_DEFAULTS["ennichi.omikuji"].map((p, line) => ({ ...p, lotId: p.oneOfOne ? null : (have(ENNICHI_POOL_LOTS[line] ?? null) ?? p.lotId) }));
  if (await setIfAbsent(db, "ennichi.omikuji", pool)) settings++;
  return { lots: created, settings };
}
