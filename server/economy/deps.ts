import "server-only";
import { randomInt } from "node:crypto";
import { groupByRarity } from "@/lib/boosters/draw";
import type { ReferralRules } from "@/lib/economy/referral";
import { getBoosterPool, getBoosterTypeEntry } from "../boosters/pools";
import { getSetting } from "../settings";
import type { LotDeps } from "./lots";

/** Hasard cryptographique et pool du booster standard pour les cartes « par rareté » des lots. */
export function lotDeps(): LotDeps {
  return {
    rng: (max) => randomInt(0, max),
    loadPool: async () => {
      const entry = await getBoosterTypeEntry("standard");
      return entry ? getBoosterPool(entry) : groupByRarity([]);
    },
  };
}

export async function referralRules(): Promise<ReferralRules> {
  const [enabled, attachWindowDays, maxPerMonth, minAccountAgeHours, minBoostersOpened, requireVerified] = await Promise.all([
    getSetting("referral.enabled"),
    getSetting("referral.attachWindowDays"),
    getSetting("referral.maxPerMonth"),
    getSetting("referral.minAccountAgeHours"),
    getSetting("referral.minBoostersOpened"),
    getSetting("referral.requireVerified"),
  ]);
  return { enabled, attachWindowDays, maxPerMonth, minAccountAgeHours, minBoostersOpened, requireVerified };
}
