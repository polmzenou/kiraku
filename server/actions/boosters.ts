"use server";

import { getLocale } from "next-intl/server";
import { refresh } from "next/cache";
import { z } from "zod";
import { OPEN_COUNTS } from "@/lib/boosters/catalog";
import { slugSchema } from "@/lib/boosters/types";
import type { OpenedBoosterView } from "@/lib/boosters/view";
import { boosterStateFrom, type BoosterState } from "../boosters/state";
import { cardViews } from "../boosters/display";
import { openBoosters } from "../boosters/open";
import { OpenError, type OpenErrorCode } from "../boosters/open-core";
import { rateLimit } from "../ratelimit";
import { getCurrentUser } from "../user";

// Ouverture de boosters. Ordre des contrôles : session → Zod → propriété → rate limit.
// Le client n'envoie qu'une intention (quel booster, combien, accepte-t-il de payer) ;
// type, prix, tirage, stock et pitiés sont décidés ici.

export type OpenBoosterError =
  | "NO_SESSION"
  | "INVALID"
  | "RATE_LIMITED"
  | "NO_BOOSTER"
  | "NEEDS_PAYMENT"
  | "NOT_ENOUGH_ZENI"
  | "NOT_FOR_SALE"
  | "UNAVAILABLE";

export type OpenBoosterResult =
  | { ok: true; boosters: OpenedBoosterView[]; state: BoosterState; featuredCount: number; zeniSpent: number }
  | { ok: false; error: OpenBoosterError };

const openSchema = z.object({
  booster: slugSchema,
  count: z.union(OPEN_COUNTS.map((n) => z.literal(n))),
  pay: z.boolean().default(false),
});

const PUBLIC_ERRORS: Partial<Record<OpenErrorCode, OpenBoosterError>> = {
  NO_BOOSTER: "NO_BOOSTER",
  NEEDS_PAYMENT: "NEEDS_PAYMENT",
  NOT_ENOUGH_ZENI: "NOT_ENOUGH_ZENI",
  NOT_FOR_SALE: "NOT_FOR_SALE",
};

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
    opened = await openBoosters(user.id, parsed.data.booster, parsed.data.count, parsed.data.pay);
  } catch (e) {
    if (e instanceof OpenError) return { ok: false, error: PUBLIC_ERRORS[e.code] ?? "UNAVAILABLE" };
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
    featuredHit: b.featuredHit,
    featuredPityTriggered: b.featuredPityTriggered,
    zeniSpent: b.zeniSpent,
    cards: b.cards.map((c) => ({
      ...views.get(c.cardId)!,
      userCardId: c.userCardId,
      isNew: c.isNew,
      featured: c.featured,
    })),
  }));
  const state = boosterStateFrom(
    {
      boosterStock: outcome.stock.stock,
      boosterAnchor: outcome.stock.anchor,
      pityCount: outcome.pityCount,
      standardCount: outcome.standardCount,
      coins: outcome.coins,
    },
    rules,
  );

  // En-tête (stock, ensō, solde) à jour sans recharger la page
  refresh();
  return { ok: true, boosters, state, featuredCount: outcome.featuredCount, zeniSpent: outcome.zeniSpent };
}
