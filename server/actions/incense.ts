"use server";

import { refresh } from "next/cache";
import { z } from "@/lib/zod";
import { isFrozen } from "@/lib/account/deletion";
import { activateIncense } from "../boosters/incense";
import { IncenseError } from "../boosters/incense-core";
import { rateLimit } from "../ratelimit";
import { getCurrentUser } from "../user";

// Activation d'un Encens. Ordre : session → Zod (aucune donnée attendue) → joueur actif → rate limit ;
// Encens disponibles et fin du boost sont recalculés sous verrou.

export type ActivateIncenseResult =
  | { ok: true; until: number; available: number }
  | { ok: false; error: "NO_SESSION" | "INVALID" | "UNAVAILABLE" | "RATE_LIMITED" | "NO_INCENSE" };

const activateSchema = z.object({}).strict();

export async function activateIncenseAction(input: unknown = {}): Promise<ActivateIncenseResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  if (!activateSchema.safeParse(input).success) return { ok: false, error: "INVALID" };
  if (user.bannedAt || isFrozen(user)) return { ok: false, error: "UNAVAILABLE" };
  if (!(await rateLimit(`incense:${user.id}`, { limit: 5, windowSeconds: 10 })).success) return { ok: false, error: "RATE_LIMITED" };
  try {
    // Propriété : l'Encens est toujours celui du joueur de la session
    const activated = await activateIncense(user.id);
    refresh();
    return { ok: true, until: activated.until.getTime(), available: activated.available };
  } catch (e) {
    if (e instanceof IncenseError) return { ok: false, error: e.code === "NO_INCENSE" ? "NO_INCENSE" : "UNAVAILABLE" };
    console.error("[encens] activation impossible", e);
    return { ok: false, error: "UNAVAILABLE" };
  }
}
