"use server";

import { getLocale } from "next-intl/server";
import { refresh } from "next/cache";
import { z } from "@/lib/zod";
import { OPEN_COUNTS } from "@/lib/boosters/catalog";
import { slugSchema } from "@/lib/boosters/types";
import type { DroppedSealedView, OpenedBoosterView } from "@/lib/boosters/view";
import { isFrozen } from "@/lib/account/deletion";
import { boosterStateFrom, type BoosterState } from "../boosters/state";
import { cardViews } from "../boosters/display";
import { openBoosters, openSealed } from "../boosters/open";
import { OpenError, type OpenedBoosterRow, type OpenErrorCode } from "../boosters/open-core";
import { pushLater } from "../market/queries";
import { qualifyLater } from "../economy/referral";
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
  | {
      ok: true;
      boosters: OpenedBoosterView[];
      /** Sachets scellés tombés à la place de certains boosters (à garder, ouvrir ou offrir). */
      drops: DroppedSealedView[];
      state: BoosterState;
      featuredCount: number;
      zeniSpent: number;
      /** Boosters crédités de ce type restant à ouvrir (mode crédit). */
      credits: number;
    }
  | { ok: false; error: OpenBoosterError };

const openSchema = z.object({
  booster: slugSchema,
  count: z.union(OPEN_COUNTS.map((n) => z.literal(n))),
  pay: z.boolean().default(false),
  // Booster crédité (cadeau, boutique, récompense) : jamais payé en plus
  credit: z.boolean().default(false),
}).refine((v) => !v.credit || !v.pay);

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
  if (user.bannedAt || isFrozen(user)) return { ok: false, error: "UNAVAILABLE" };

  if (!(await rateLimit(`open:${user.id}`, { limit: 20, windowSeconds: 10 })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }

  let opened: Awaited<ReturnType<typeof openBoosters>>;
  try {
    opened = await openBoosters(user.id, parsed.data.booster, parsed.data.count, parsed.data.pay, parsed.data.credit);
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
  const boosters = outcome.boosters.map((b) => toView(b, views));
  const state = boosterStateFrom(
    {
      boosterStock: outcome.stock.stock,
      boosterAnchor: outcome.stock.anchor,
      pityCount: outcome.pityCount,
      standardCount: outcome.standardCount,
      coins: outcome.coins,
      ambassadorSince: outcome.ambassadorSince,
    },
    rules,
  );

  // Un filleul qui ouvre des boosters avance vers sa qualification (vérifiée après la réponse)
  if (user.referredById) qualifyLater(user.id);

  // En-tête (stock, ensō, solde) à jour sans recharger la page
  refresh();
  return {
    ok: true,
    boosters,
    drops: outcome.drops,
    state,
    featuredCount: outcome.featuredCount,
    zeniSpent: outcome.zeniSpent,
    credits: outcome.credits,
  };
}

function toView(b: OpenedBoosterRow, views: Awaited<ReturnType<typeof cardViews>>): OpenedBoosterView {
  return {
    id: b.id,
    golden: b.golden,
    divine: b.divine,
    sealed: b.sealed,
    apocalypse: b.apocalypse,
    pityTriggered: b.pityTriggered,
    featuredHit: b.featuredHit,
    featuredPityTriggered: b.featuredPityTriggered,
    zeniSpent: b.zeniSpent,
    cards: b.cards.map((c) => ({
      ...views.get(c.cardId)!,
      userCardId: c.userCardId,
      isNew: c.isNew,
      featured: c.featured,
      wished: c.wished,
    })),
  };
}

export type OpenSealedResult =
  | { ok: true; booster: OpenedBoosterView; karma: number }
  | { ok: false; error: OpenBoosterError };

const openSealedSchema = z.object({ drop: z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/) });

/** Ouvre un sachet scellé (Divin, Apocalyptique) du joueur : l'issue est tirée ici. */
export async function openSealedAction(input: unknown): Promise<OpenSealedResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };

  const parsed = openSealedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };

  // Propriété : le sachet est cherché parmi ceux du compte de la session, puis réclamé sous verrou
  if (user.bannedAt || isFrozen(user)) return { ok: false, error: "UNAVAILABLE" };

  if (!(await rateLimit(`open:${user.id}`, { limit: 20, windowSeconds: 10 })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }

  let opened: Awaited<ReturnType<typeof openSealed>>;
  try {
    opened = await openSealed(user.id, parsed.data.drop, pushLater);
  } catch (e) {
    if (e instanceof OpenError) return { ok: false, error: PUBLIC_ERRORS[e.code] ?? "UNAVAILABLE" };
    console.error("[boosters] ouverture d'un sachet scellé impossible", e);
    return { ok: false, error: "UNAVAILABLE" };
  }
  const { booster, karma } = opened.outcome;
  const views = await cardViews(booster.cards.map((c) => c.cardId), await getLocale());
  refresh();
  return { ok: true, booster: toView(booster, views), karma };
}
