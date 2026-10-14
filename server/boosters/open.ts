import "server-only";
import { randomInt } from "node:crypto";
import { buildRarityTables, featuredFromPool } from "@/lib/boosters/draw";
import { effectiveSlotFloors } from "@/lib/boosters/types";
import { prisma } from "../db";
import { OpenError, openBoostersWith } from "./open-core";
import { getBoosterOffers, getBoosterPool, getBoosterTypeEntry } from "./pools";
import { getBoosterRules } from "./rules";

/** Type des boosters offerts entre amis (étape 6). */
export const GIFT_BOOSTER_SLUG = "standard";

/**
 * Ouvre `count` boosters du type `slug` pour ce joueur : type lu en base (actif, dans ses dates,
 * pool suffisant), réglages de l'admin, hasard cryptographique. `pay` : le joueur accepte de payer
 * en Zeni si le stock gratuit ne suffit pas (jamais de débit sans cet accord).
 */
export async function openBoosters(userId: string, slug: string, count: number, pay: boolean, gift = false) {
  // Un booster offert est toujours un booster standard
  if (gift && slug !== GIFT_BOOSTER_SLUG) throw new OpenError("NOT_FOR_SALE");
  const [entry, offers, rules] = await Promise.all([getBoosterTypeEntry(slug), getBoosterOffers(), getBoosterRules()]);
  const offer = offers.find((o) => o.type.slug === slug);
  if (!entry || !offer || offer.availability !== "open") throw new OpenError("NOT_FOR_SALE");

  const { type } = entry;
  const pool = await getBoosterPool(entry);
  const draw = { ...rules.draw, slotFloors: effectiveSlotFloors(type.slotFloors, rules.draw.slotFloors) };
  const outcome = await openBoostersWith(prisma, {
    userId,
    type,
    count,
    pay,
    gift,
    rules: { draw, stock: rules.stock },
    tables: buildRarityTables(draw.rates),
    pool,
    featured: featuredFromPool(type.featuredCardIds, pool, { rate: type.featuredRate, pityThreshold: type.featuredPity }),
    rng: (max) => randomInt(0, max),
  });
  return { outcome, rules, type };
}
