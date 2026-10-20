import type { SettingKey } from "./defaults";
import { settingsSchemaFor, type SettingsOf } from "./form";

// Réglages du panneau /admin/marche : interrupteur, règles des enchères, limites et échanges ouverts.

export const MARKET_SETTING_KEYS = [
  "market.enabled",
  "market.feeBp",
  "market.minIncrementBp",
  "market.antiSnipeSeconds",
  "market.extendSeconds",
  "market.durationsHours",
  "market.maxActivePerSeller",
  "market.minAccountAgeHours",
  "market.minStartPrice",
  "market.maxPrice",
  "market.pollSeconds",
  "listings.enabled",
  "listings.expiryHours",
  "listings.maxWants",
  "listings.maxActive",
  "listings.perDay",
  "listings.maxPendingOffers",
  "listings.allowOther",
  "listings.allowedRarities",
] as const satisfies readonly SettingKey[];

export type MarketSettingKey = (typeof MARKET_SETTING_KEYS)[number];

export type MarketSettings = SettingsOf<MarketSettingKey>;

// Le prix de départ minimal ne peut pas dépasser le prix maximal (sinon aucune vente possible)
export const marketSettingsSchema = settingsSchemaFor(MARKET_SETTING_KEYS).refine(
  (s) => s["market.minStartPrice"] < s["market.maxPrice"],
  { message: "Prix de départ minimal ≥ prix maximal" },
);

/** « 1, 6, 24 » → [1, 6, 24] ; null si la saisie n'est pas une liste d'entiers. */
export function parseDurations(text: string): number[] | null {
  const parts = text.split(/[\s,;]+/).filter(Boolean);
  if (parts.length === 0 || !parts.every((p) => /^\d{1,3}$/.test(p))) return null;
  return parts.map(Number);
}
