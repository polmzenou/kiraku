import "server-only";
import type { PrintingRules } from "@/lib/prestige/printing";
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

/**
 * Réglages des éditions gravées pour une ouverture ; null quand le prestige est coupé (aucune gravure, même pour un
 * joueur déjà rené).
 */
export async function getPrintingRules(): Promise<PrintingRules | null> {
  const [enabled, minPrestige, chanceBp, sizes, current] = await Promise.all([
    getSetting("prestige.enabled"),
    getSetting("prestige.printing.minPrestige"),
    getSetting("prestige.printing.chanceBp"),
    getSetting("prestige.printing.sizes"),
    getSetting("prestige.printing.current"),
  ]);
  return enabled ? { minPrestige, chanceBp, sizes, current } : null;
}

/** Sceaux des tirages ({ "1": "初摺" }), pour l'affichage des éditions. */
export async function getPrintingSeals(): Promise<Record<string, string>> {
  return getSetting("prestige.printing.seals");
}
