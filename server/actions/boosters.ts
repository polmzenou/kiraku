"use server";

import { getLocale } from "next-intl/server";
import { refresh } from "next/cache";
import { z } from "zod";
import { BOOSTER_SLUGS, OPEN_COUNTS } from "@/lib/boosters/catalog";
import type { OpenedBoosterView } from "@/lib/boosters/view";
import { boosterStateFrom, type BoosterState } from "../boosters/state";
import { cardViews } from "../boosters/display";
import { openBoosters } from "../boosters/open";
import { OpenError } from "../boosters/open-core";
import { rateLimit } from "../ratelimit";
import { getCurrentUser } from "../user";

// Ouverture de boosters. Ordre des contrôles : session → Zod → propriété → rate limit.
// Le client n'envoie qu'une intention (quel booster, combien) ; tirage, stock et pitié sont décidés ici.

export type OpenBoosterError = "NO_SESSION" | "INVALID" | "RATE_LIMITED" | "NO_BOOSTER" | "UNAVAILABLE";

export type OpenBoosterResult =
  | { ok: true; boosters: OpenedBoosterView[]; state: BoosterState }
  | { ok: false; error: OpenBoosterError };

const openSchema = z.object({
  booster: z.enum(BOOSTER_SLUGS),
  count: z.union(OPEN_COUNTS.map((n) => z.literal(n))),
});

export async function openBoosterAction(input: unknown): Promise<OpenBoosterResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };

  const parsed = openSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };

  // Propriété : aucun id de joueur n'est reçu, l'ouverture porte toujours sur le compte de la session
  if (user.bannedAt) return { ok: false, error: "UNAVAILABLE" };

  if (!(await rateLimit(`open:${user.id}`, { limit: 20, windowSeconds: 10 })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }

  let opened: Awaited<ReturnType<typeof openBoosters>>;
  try {
    opened = await openBoosters(user.id, parsed.data.booster, parsed.data.count);
  } catch (e) {
    if (e instanceof OpenError) return { ok: false, error: e.code === "NO_BOOSTER" ? "NO_BOOSTER" : "UNAVAILABLE" };
    console.error("[boosters] ouverture impossible", e);
    return { ok: false, error: "UNAVAILABLE" };
  }

  const { outcome, rules } = opened;
  const views = await cardViews(
    outcome.boosters.flatMap((b) => b.cards.map((c) => c.cardId)),
    await getLocale(),
  );
  const boosters: OpenedBoosterView[] = outcome.boosters.map((b) => ({
    id: b.id,
    golden: b.golden,
    divine: b.divine,
    pityTriggered: b.pityTriggered,
    cards: b.cards.map((c) => ({ ...views.get(c.cardId)!, userCardId: c.userCardId, isNew: c.isNew })),
  }));
  const state = boosterStateFrom(
    {
      boosterStock: outcome.stock.stock,
      boosterAnchor: outcome.stock.anchor,
      pityCount: outcome.pityCount,
      standardCount: outcome.standardCount,
    },
    rules,
  );

  // En-tête (stock, ensō) à jour sans recharger la page
  refresh();
  return { ok: true, boosters, state };
}
