import "server-only";
import { randomInt } from "node:crypto";
import { buildRarityTables, featuredFromPool, SEALED_KINDS, type SealedKind } from "@/lib/boosters/draw";
import { effectiveSlotFloors } from "@/lib/boosters/types";
import { prisma } from "../db";
import type { OnNotified } from "../social/notify";
import { OpenError, openBoostersWith, openSealedWith } from "./open-core";
import { getBoosterOffers, getBoosterPool, getBoosterTypeEntry, type BoosterTypeEntry } from "./pools";
import { getBoosterRules } from "./rules";

/** Types des sachets scellés en service (actifs, pool non vide) : un sachet sans type ne tombe pas. */
async function sealedEntries(): Promise<Partial<Record<SealedKind, BoosterTypeEntry>>> {
  const entries = await Promise.all(SEALED_KINDS.map((kind) => getBoosterTypeEntry(kind)));
  return Object.fromEntries(
    SEALED_KINDS.flatMap((kind, i) => {
      const entry = entries[i];
      return entry && entry.type.kind === "DROP" && entry.type.active && entry.type.filter !== null ? [[kind, entry]] : [];
    }),
  );
}

/**
 * Ouvre `count` boosters du type `slug` pour ce joueur : type lu en base (actif, dans ses dates,
 * pool suffisant), réglages de l'admin, hasard cryptographique. `pay` : le joueur accepte de payer
 * en Zeni si le stock gratuit ne suffit pas (jamais de débit sans cet accord). `credit` : ouvre des
 * boosters crédités (cadeau, boutique, récompense) ; ils restent ouvrables après la fin d'un
 * événement, tant que le type existe et que son pool n'est pas vide.
 */
export async function openBoosters(userId: string, slug: string, count: number, pay: boolean, credit = false) {
  const [entry, offers, rules, sealed] = await Promise.all([getBoosterTypeEntry(slug), getBoosterOffers(), getBoosterRules(), sealedEntries()]);
  const offer = offers.find((o) => o.type.slug === slug);
  if (!entry || entry.type.filter === null) throw new OpenError("NOT_FOR_SALE");
  if (!credit && (!offer || offer.availability !== "open")) throw new OpenError("NOT_FOR_SALE");

  const { type } = entry;
  const pool = await getBoosterPool(entry);
  const draw = { ...rules.draw, slotFloors: effectiveSlotFloors(type.slotFloors, rules.draw.slotFloors) };
  const outcome = await openBoostersWith(prisma, {
    userId,
    type,
    count,
    pay: credit ? false : pay,
    credit,
    rules: { draw, stock: rules.stock },
    tables: buildRarityTables(draw.rates),
    pool,
    featured: featuredFromPool(type.featuredCardIds, pool, { rate: type.featuredRate, pityThreshold: type.featuredPity }),
    // Un sachet dont le type est absent ou désactivé ne peut pas tomber
    sealedTypes: Object.fromEntries(Object.entries(sealed).map(([kind, e]) => [kind, e.type.id])),
    rng: (max) => randomInt(0, max),
  });
  return { outcome, rules, type };
}

/** Sachet scellé non ouvert du joueur, avec son type ; null s'il n'existe pas ou n'est pas à lui. */
export async function findOwnSealed(userId: string, dropId: string) {
  const drop = await prisma.sealedDrop.findFirst({
    where: { id: dropId, ownerId: userId, openedAt: null },
    select: { id: true, giftable: true, boosterType: { select: { slug: true } } },
  });
  if (!drop) return null;
  const kind = SEALED_KINDS.find((k) => k === drop.boosterType.slug);
  return kind ? { id: drop.id, giftable: drop.giftable, kind } : null;
}

/** Ouvre un sachet scellé du joueur (Divin, Apocalyptique), même si son type a été désactivé depuis. */
export async function openSealed(userId: string, dropId: string, onNotified?: OnNotified) {
  const found = await findOwnSealed(userId, dropId);
  if (!found) throw new OpenError("NO_BOOSTER");
  const [entry, rules] = await Promise.all([getBoosterTypeEntry(found.kind), getBoosterRules()]);
  if (!entry || entry.type.filter === null) throw new OpenError("NOT_FOR_SALE");

  const pool = await getBoosterPool(entry);
  const draw = { ...rules.draw, slotFloors: effectiveSlotFloors(entry.type.slotFloors, rules.draw.slotFloors) };
  const outcome = await openSealedWith(prisma, {
    userId,
    dropId: found.id,
    kind: found.kind,
    type: entry.type,
    rules: { draw, ruin: rules.ruin },
    tables: buildRarityTables(draw.rates),
    pool,
    rng: (max) => randomInt(0, max),
  }, onNotified);
  return { outcome, rules, type: entry.type };
}
