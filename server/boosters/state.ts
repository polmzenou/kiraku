import "server-only";
import { boostersUntilGolden, boostersUntilPity } from "@/lib/boosters/draw";
import { computeStock } from "@/lib/boosters/stock";
import type { BoosterRules } from "./rules";

/** État des boosters envoyé au client : il affiche un compte à rebours, il ne décide jamais du stock. */
export type BoosterState = {
  stock: number;
  max: number;
  /** Arrivée du prochain booster (ms depuis l'époque), null si le stock est plein. */
  nextAt: number | null;
  intervalMs: number;
  /** Heure du serveur au moment du calcul, pour un premier rendu identique côté client. */
  serverNow: number;
  pityLeft: number;
  pityThreshold: number;
  goldenIn: number | null;
  /** Solde en Zeni (achat d'un booster quand le stock est vide). */
  coins: number;
};

export type BoosterCounters = {
  boosterStock: number;
  boosterAnchor: Date;
  pityCount: number;
  standardCount: number;
  coins: number;
};

/** Calcul en lecture seule : rien n'est écrit, l'ouverture recalcule sous verrou. */
export function boosterStateFrom(user: BoosterCounters, rules: BoosterRules, now = new Date()): BoosterState {
  const s = computeStock(user.boosterStock, user.boosterAnchor, now, rules.stock);
  return {
    stock: s.stock,
    max: rules.stock.max,
    nextAt: s.nextAt?.getTime() ?? null,
    intervalMs: rules.stock.intervalMs,
    serverNow: now.getTime(),
    pityLeft: boostersUntilPity(user.pityCount, rules.draw.pityThreshold),
    pityThreshold: rules.draw.pityThreshold,
    goldenIn: boostersUntilGolden(user.standardCount, rules.draw.goldenEvery),
    coins: user.coins,
  };
}
