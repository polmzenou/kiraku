import "server-only";
import { randomInt } from "node:crypto";
import { periodWindow } from "@/lib/economy/period";
import type { ExpeditionRules } from "@/lib/expedition/types";
import { getRarityDefinitions } from "../catalog/rarities";
import { lotDeps } from "../economy/deps";
import { getSetting } from "../settings";
import type { ExpeditionCtx, SettleDeps } from "./expedition-core";

// Réglages des expéditions (GameSetting expedition.*) et dépendances du serveur (hasard cryptographique).

export async function getExpeditionRules(): Promise<ExpeditionRules> {
  const [enabled, offersPerDay, abandonCooldownHours, cardBonus, triumphRewardPct, failRewardPct] = await Promise.all([
    getSetting("expedition.enabled"),
    getSetting("expedition.offersPerDay"),
    getSetting("expedition.abandonCooldownHours"),
    getSetting("expedition.cardBonus"),
    getSetting("expedition.triumphRewardPct"),
    getSetting("expedition.failRewardPct"),
  ]);
  return { enabled, offersPerDay, abandonCooldownHours, cardBonus, triumphRewardPct, failRewardPct };
}

/** Contexte d'une requête : heure, jour du jeu, réglages, registre des raretés. */
export async function expeditionCtx(preview: boolean, now = new Date()): Promise<ExpeditionCtx & { nextResetAt: Date }> {
  const [rules, timeZone, definitions] = await Promise.all([getExpeditionRules(), getSetting("game.timeZone"), getRarityDefinitions()]);
  const day = periodWindow("DAILY", now, timeZone);
  return { now, dayKey: day.key, nextResetAt: day.end, rules, definitions, preview: preview && !rules.enabled };
}

export function settleDeps(): SettleDeps {
  return { rng: (max) => randomInt(0, max), lot: lotDeps() };
}
