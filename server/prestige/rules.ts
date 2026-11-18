import "server-only";
import type { PrestigeRules } from "@/lib/prestige/rules";
import { getSetting } from "../settings";

// Réglages du prestige lus dans GameSetting (valeurs par défaut dans lib/settings/defaults.ts).

export async function getPrestigeRules(): Promise<PrestigeRules> {
  const [enabled, requiredPercent, keepSlots, minDaysBetween, maxCopies, heritageMax, consecrateMinOwnCycles, zeniTiers, zeniCap, recycleMultiplier] =
    await Promise.all([
      getSetting("prestige.enabled"),
      getSetting("prestige.requiredPercent"),
      getSetting("prestige.keepSlots"),
      getSetting("prestige.minDaysBetween"),
      getSetting("prestige.maxCopies"),
      getSetting("prestige.heritageMax"),
      getSetting("prestige.consecrateMinOwnCycles"),
      getSetting("prestige.zeniTiers"),
      getSetting("prestige.zeniCap"),
      getSetting("prestige.printing.recycleMultiplier"),
    ]);
  return { enabled, requiredPercent, keepSlots, minDaysBetween, maxCopies, heritageMax, consecrateMinOwnCycles, zeniTiers, zeniCap, recycleMultiplier };
}
