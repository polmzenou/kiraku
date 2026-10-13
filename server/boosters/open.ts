import "server-only";
import { randomInt } from "node:crypto";
import type { BoosterSlug } from "@/lib/boosters/catalog";
import { buildRarityTables } from "@/lib/boosters/draw";
import { prisma } from "../db";
import { openBoostersWith } from "./open-core";
import { getStandardPool } from "./pool";
import { getBoosterRules } from "./rules";

/** Ouvre `count` boosters pour ce joueur avec les réglages de l'admin et le hasard cryptographique. */
export async function openBoosters(userId: string, slug: BoosterSlug, count: number) {
  const [rules, pool] = await Promise.all([getBoosterRules(), getStandardPool()]);
  const outcome = await openBoostersWith(prisma, {
    userId,
    slug,
    count,
    rules,
    tables: buildRarityTables(rules.draw.rates),
    pool,
    rng: (max) => randomInt(0, max),
  });
  return { outcome, rules };
}
