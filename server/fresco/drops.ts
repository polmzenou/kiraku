import "server-only";
import { randomInt } from "node:crypto";
import { lotDeps } from "../economy/deps";
import { getSetting } from "../settings";
import type { FrescoDropInput } from "./award-core";
import { getLiveFrescoes, toFrescoSource } from "./queries";

/**
 * Fresques qui peuvent tomber d'une ouverture : réglages de l'admin et fresques publiées, hasard
 * cryptographique. null quand la chute est coupée ou qu'aucune fresque n'est publiée.
 */
export async function frescoDropInput(): Promise<FrescoDropInput | null> {
  const [enabled, rate, live] = await Promise.all([getSetting("fresco.enabled"), getSetting("fresco.dropRate"), getLiveFrescoes()]);
  if (!enabled || rate <= 0 || live.length === 0) return null;
  return { sources: live.map(toFrescoSource), rate, rng: (max) => randomInt(0, max), lotDeps: lotDeps() };
}
