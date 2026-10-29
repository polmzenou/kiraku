import type { Rarity } from "@/lib/catalog/rarity";
import { boostRates, type DrawRules, type RarityRates } from "./draw";

// Encens : un objet gagné à chaque palier de cartes tirées en boosters (doublons compris), rétroactif.
// Activé, il boost les taux à partir d'une rareté (Légendaire par défaut) pendant quelques heures, sur
// tous les boosters. Un Encens activé pendant un autre prolonge le boost, sans cumuler la force.

export type IncenseSettings = {
  /** Cartes tirées par Encens gagné. */
  cardStep: number;
  durationHours: number;
  /** Points de base (10 000 = ×1). */
  rateBoost: number;
  boostFrom: Rarity;
};

/** Encens gagnés depuis le début : un par palier complet. */
export function incenseEarned(pulled: number, step: number): number {
  return step > 0 ? Math.floor(Math.max(0, pulled) / step) : 0;
}

/** Encens encore à activer (jamais négatif si le palier a été relevé par l'admin). */
export function incenseAvailable(pulled: number, step: number, used: number): number {
  return Math.max(0, incenseEarned(pulled, step) - used);
}

/** Cartes à tirer avant le prochain Encens. */
export function cardsToNextIncense(pulled: number, step: number): number {
  if (step <= 0) return 0;
  return step - (Math.max(0, pulled) % step);
}

export function isIncenseActive(until: Date | null, now: Date): boolean {
  return until !== null && until > now;
}

/** Fin du boost après activation : part de maintenant, ou prolonge celui en cours. */
export function extendIncense(until: Date | null, now: Date, durationHours: number): Date {
  const start = isIncenseActive(until, now) ? until!.getTime() : now.getTime();
  return new Date(start + durationHours * 3_600_000);
}

/** Total des poids sous lequel on reste (crypto.randomInt refuse un écart ≥ 2^48). */
export const MAX_RATE_TOTAL = 2 ** 46;

/** Poids réduits proportionnellement si leur total dépasse `max` (une part non nulle le reste). */
export function fitRates(rates: RarityRates, max = MAX_RATE_TOTAL): RarityRates {
  const total = Object.values(rates).reduce((sum, w) => sum + w, 0);
  if (total <= max) return rates;
  const div = Math.ceil(total / max) * 2;
  return Object.fromEntries(Object.entries(rates).map(([r, w]) => [r, w > 0 ? Math.max(1, Math.round(w / div)) : 0])) as RarityRates;
}

/**
 * Règles de tirage sous Encens : les taux (déjà ceux du type, Impérial compris) boostés à partir de
 * boostFrom. boostRates multiplie les poids par au plus max(10 000, facteur) : ceux d'un type déjà
 * boosté sont d'abord réduits pour que le total reste sous MAX_RATE_TOTAL.
 */
export function incenseDrawRules(rules: DrawRules, settings: Pick<IncenseSettings, "rateBoost" | "boostFrom">): DrawRules {
  const base = fitRates(rules.rates, MAX_RATE_TOTAL / Math.max(10_000, settings.rateBoost));
  return { ...rules, rates: boostRates(base, settings.boostFrom, settings.rateBoost, rules.rarities) };
}
