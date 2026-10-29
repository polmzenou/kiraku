import "server-only";
import { cardsToNextIncense, incenseAvailable, isIncenseActive, type IncenseSettings } from "@/lib/boosters/incense";
import { prisma } from "../db";
import { getSetting } from "../settings";
import { activateIncenseWith, cardsPulled } from "./incense-core";

/** Réglages de l'Encens, lus dans GameSetting. */
export async function getIncenseSettings(): Promise<IncenseSettings> {
  const [cardStep, durationHours, rateBoost, boostFrom] = await Promise.all([
    getSetting("incense.cardStep"),
    getSetting("incense.durationHours"),
    getSetting("incense.rateBoost"),
    getSetting("incense.boostFrom"),
  ]);
  return { cardStep, durationHours, rateBoost, boostFrom };
}

/** Ce que le panneau de l'Encens affiche ; le client n'en tire qu'un compte à rebours. */
export type IncenseState = {
  available: number;
  /** Fin du boost en cours (ms depuis l'époque), null s'il n'y en a pas. */
  activeUntil: number | null;
  pulled: number;
  cardStep: number;
  toNext: number;
  durationHours: number;
  /** Multiplicateur affiché (30 000 points de base → 3). */
  factor: number;
  boostFrom: string;
  serverNow: number;
};

export async function getIncenseState(userId: string, now = new Date()): Promise<IncenseState | null> {
  const [settings, user, pulled] = await Promise.all([
    getIncenseSettings(),
    prisma.user.findUnique({ where: { id: userId }, select: { incenseUsed: true, incenseUntil: true } }),
    cardsPulled(prisma, userId),
  ]);
  if (!user) return null;
  return {
    available: incenseAvailable(pulled, settings.cardStep, user.incenseUsed),
    activeUntil: isIncenseActive(user.incenseUntil, now) ? user.incenseUntil!.getTime() : null,
    pulled,
    cardStep: settings.cardStep,
    toNext: cardsToNextIncense(pulled, settings.cardStep),
    durationHours: settings.durationHours,
    factor: settings.rateBoost / 10_000,
    boostFrom: settings.boostFrom,
    serverNow: now.getTime(),
  };
}

export async function activateIncense(userId: string) {
  return activateIncenseWith(prisma, userId, await getIncenseSettings());
}
