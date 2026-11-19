"use server";

import { getLocale } from "next-intl/server";
import { refresh, updateTag } from "next/cache";
import { isStaff } from "@/lib/admin/roles";
import type { CardView } from "@/lib/boosters/view";
import type { RebirthBoosterView } from "@/lib/prestige/cinematic";
import { z } from "@/lib/zod";
import { cardViews } from "../boosters/display";
import { LEADERBOARD_TAG } from "../collection/leaderboard";
import { prisma } from "../db";
import { consecrateWith, ConsecrateError, type ConsecrateErrorCode } from "../prestige/consecrate-core";
import { previewRebirthWith, rebirthWith, RebirthError, type Departed, type RebirthErrorCode, type RebirthHeir } from "../prestige/prestige-core";
import { printingsUnlockedAt, rebirthBoosterView, rebirthCtx } from "../prestige/queries";
import { getPrestigeRules } from "../prestige/rules";
import { rateLimit } from "../ratelimit";
import { requireActiveUser } from "../user";

// Prestige. Ordre des contrôles : session → Zod → interrupteur → rate limit, puis tout est relu sous le verrou
// du joueur (server/prestige/prestige-core.ts) : prestige attendu, blocages, seuils, héritières, gravées, Zeni.
// Le client n'envoie que des ids d'exemplaires et de cartes, et ce qu'il a vu dans le récapitulatif.

export type PrestigeActionError = "NO_SESSION" | "INVALID" | "DISABLED" | "RATE_LIMITED" | RebirthErrorCode;

type Failure = { ok: false; error: PrestigeActionError };

const id = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const keepSchema = {
  keepCopyIds: z.array(id).max(100),
  keepCardIds: z.array(id).max(100),
};
const previewSchema = z.object(keepSchema).strict();
const rebirthSchema = z
  .object({
    ...keepSchema,
    expectedPrestige: z.number().int().min(0).max(100_000),
    expectedZeni: z.number().int().min(0).max(100_000_000),
    sacrificedEngraved: z.array(id).max(5_000),
  })
  .strict();

/** Interrupteur : coupé, seule l'équipe peut essayer (aperçu). */
async function allowed(role: string | null | undefined, enabled: boolean) {
  return enabled || isStaff(role);
}

function failure(scope: string, e: unknown): Failure {
  if (e instanceof RebirthError) return { ok: false, error: e.code };
  console.error(`[prestige] ${scope}`, e);
  throw e;
}

export type RebirthPreviewView = {
  departed: Departed[];
  leaving: number;
  zeni: number;
  /** Gravées qui partiraient : à confirmer une à une. */
  engraved: { id: string; serial: number; printing: number; card: CardView }[];
  /** Boosters offerts avec la renaissance. */
  booster: RebirthBoosterView | null;
};

/** Récapitulatif de la renaissance pour les héritières choisies : ce qui part, les Zeni, les gravées sacrifiées. */
export async function previewRebirthAction(input: unknown): Promise<{ ok: true; preview: RebirthPreviewView } | Failure> {
  const user = await requireActiveUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const ctx = await rebirthCtx();
  if (!(await allowed(user.role, ctx.rules.enabled))) return { ok: false, error: "DISABLED" };
  if (!(await rateLimit(`prestige-preview:${user.id}`, { limit: 30, windowSeconds: 60 }, { store: "memory" })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  try {
    const preview = await previewRebirthWith(prisma, user.id, { copyIds: parsed.data.keepCopyIds, cardIds: parsed.data.keepCardIds }, ctx);
    const locale = await getLocale();
    const [views, booster] = await Promise.all([cardViews(preview.engraved.map((e) => e.cardId), locale), rebirthBoosterView(ctx.booster, locale)]);
    return {
      ok: true,
      preview: {
        departed: preview.departed,
        leaving: preview.leaving,
        zeni: preview.zeni,
        engraved: preview.engraved.flatMap((e) => {
          const card = views.get(e.cardId);
          return card ? [{ id: e.id, serial: e.serial, printing: e.printing, card }] : [];
        }),
        booster,
      },
    };
  } catch (e) {
    return failure("récapitulatif", e);
  }
}

export type RebirthResultView = {
  prestige: number;
  globalRank: number;
  zeni: number;
  coins: number;
  departed: Departed[];
  heirs: (RebirthHeir & { card: CardView })[];
  /** Boosters crédités par la renaissance (à ouvrir depuis l'accueil ou le lien de fin du rite). */
  booster: RebirthBoosterView | null;
  /** Les éditions gravées tombent déjà à ce prestige (box de la cinématique). */
  printingsUnlocked: boolean;
};

/** La renaissance : une seule transaction, idempotente par le prestige que voit le joueur. */
export async function rebirthAction(input: unknown): Promise<{ ok: true; result: RebirthResultView } | Failure> {
  const user = await requireActiveUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const parsed = rebirthSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const ctx = await rebirthCtx();
  if (!(await allowed(user.role, ctx.rules.enabled))) return { ok: false, error: "DISABLED" };
  if (!(await rateLimit(`prestige-rebirth:${user.id}`, { limit: 3, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };
  try {
    const outcome = await rebirthWith(
      prisma,
      {
        userId: user.id,
        expectedPrestige: parsed.data.expectedPrestige,
        keep: { copyIds: parsed.data.keepCopyIds, cardIds: parsed.data.keepCardIds },
        expectedZeni: parsed.data.expectedZeni,
        sacrificedEngraved: parsed.data.sacrificedEngraved,
      },
      ctx,
    );
    // Classement des collectionneurs et en-tête (solde, chiffre romain) à jour
    updateTag(LEADERBOARD_TAG);
    refresh();
    const locale = await getLocale();
    const [views, booster, printingsUnlocked] = await Promise.all([
      cardViews(outcome.heirs.map((h) => h.cardId), locale),
      rebirthBoosterView(outcome.boosters, locale),
      printingsUnlockedAt(outcome.prestige),
    ]);
    return {
      ok: true,
      result: {
        prestige: outcome.prestige,
        globalRank: outcome.globalRank,
        zeni: outcome.zeni,
        coins: outcome.coins,
        departed: outcome.departed,
        heirs: outcome.heirs.flatMap((h) => {
          const card = views.get(h.cardId);
          return card ? [{ ...h, card }] : [];
        }),
        booster,
        printingsUnlocked,
      },
    };
  } catch (e) {
    return failure("renaissance", e);
  }
}

export type ConsecrateActionError = "NO_SESSION" | "INVALID" | "DISABLED" | "RATE_LIMITED" | ConsecrateErrorCode;

const consecrateSchema = z.object({ userCardId: id }).strict();

/**
 * Consécration d'une héritière au plafond, gardée par le joueur : elle quitte le jeu pour le sanctuaire de son profil,
 * pour toujours. Le client n'envoie que l'id de l'exemplaire ; tout est revérifié sous le verrou du joueur.
 */
export async function consecrateAction(input: unknown): Promise<{ ok: true; cardId: string } | { ok: false; error: ConsecrateActionError }> {
  const user = await requireActiveUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const parsed = consecrateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const rules = await getPrestigeRules();
  if (!(await allowed(user.role, rules.enabled))) return { ok: false, error: "DISABLED" };
  // Propriété, statut, héritage et garde : vérifiés sous le verrou du joueur, dans la requête qui déplace l'exemplaire
  if (!(await rateLimit(`prestige-consecrate:${user.id}`, { limit: 5, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };
  try {
    const moved = await consecrateWith(prisma, { userId: user.id, userCardId: parsed.data.userCardId, now: new Date() }, rules);
    // La carte n'est plus possédée : classement des collectionneurs et profil à jour
    updateTag(LEADERBOARD_TAG);
    refresh();
    return { ok: true, cardId: moved.cardId };
  } catch (e) {
    if (e instanceof ConsecrateError) return { ok: false, error: e.code };
    console.error("[prestige] consécration", e);
    throw e;
  }
}
