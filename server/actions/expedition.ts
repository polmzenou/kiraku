"use server";

import { MAX_OFFERS_PER_DAY } from "@/lib/expedition/types";
import { z } from "@/lib/zod";
import { prisma } from "../db";
import { rateLimit } from "../ratelimit";
import { requireActiveUser } from "../user";
import { abandonWith, ExpeditionError, launchWith, markRevealedWith, type ExpeditionErrorCode } from "../expedition/expedition-core";
import { settleExpeditionsFor } from "../expedition/queries";
import { expeditionCtx, settleDeps } from "../expedition/rules";
import { pushLater } from "../market/queries";

// Expéditions. Ordre des contrôles : session → Zod → rate limit, puis tout est relu sous le verrou du
// joueur (server/expedition/expedition-core.ts) : propriété des cartes, offre du jour, attente, chances.
// Le client n'envoie que l'offre choisie et 3 ids de Card ; chances, durée et gains sont décidés ici.

export type ExpeditionActionError = "NO_SESSION" | "INVALID" | "RATE_LIMITED" | ExpeditionErrorCode;

type Failure = { ok: false; error: ExpeditionActionError; until?: string };

const idSchema = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);

const launchSchema = z
  .object({
    dayKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    slot: z.number().int().min(0).max(MAX_OFFERS_PER_DAY - 1),
    typeId: idSchema,
    cardIds: z.array(idSchema).length(3),
  })
  .strict();

const expeditionIdSchema = z.object({ id: idSchema }).strict();

function failure(scope: string, e: unknown): Failure {
  if (e instanceof ExpeditionError) return { ok: false, error: e.code, ...(e.until ? { until: e.until.toISOString() } : {}) };
  console.error(`[expedition] ${scope}`, e);
  throw e;
}

export async function launchExpeditionAction(input: unknown): Promise<{ ok: true; id: string; endsAt: string } | Failure> {
  const user = await requireActiveUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const parsed = launchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`expedition-launch:${user.id}`, { limit: 6, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };
  const ctx = await expeditionCtx(user.role === "ADMIN");
  // L'expédition précédente vient peut-être de rentrer : close d'abord, la relance est alors immédiate. Une clôture
  // en erreur est journalisée : le lancement répond alors ACTIVE au lieu d'une erreur serveur
  await settleExpeditionsFor(user.id, ctx.now).catch((e) => console.error("[expedition] clôture avant lancement", e));
  try {
    const launched = await launchWith(prisma, { userId: user.id, ...parsed.data }, ctx);
    return { ok: true, id: launched.id, endsAt: launched.endsAt.toISOString() };
  } catch (e) {
    return failure("lancement", e);
  }
}

export async function abandonExpeditionAction(
  input: unknown,
): Promise<{ ok: true; state: "ABANDONED"; cooldownUntil: string | null } | { ok: true; state: "SETTLED" } | Failure> {
  const user = await requireActiveUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const parsed = expeditionIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`expedition-abandon:${user.id}`, { limit: 6, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };
  const ctx = await expeditionCtx(false);
  try {
    const res = await abandonWith(prisma, { userId: user.id, expeditionId: parsed.data.id }, ctx, settleDeps(), pushLater);
    return res.state === "ABANDONED"
      ? { ok: true, state: "ABANDONED", cooldownUntil: res.cooldownUntil?.toISOString() ?? null }
      : { ok: true, state: "SETTLED" };
  } catch (e) {
    return failure("abandon", e);
  }
}

/** Le joueur a vu son résultat : la révélation ne se rejoue plus. */
export async function markExpeditionRevealedAction(input: unknown): Promise<{ ok: boolean }> {
  const user = await requireActiveUser();
  if (!user) return { ok: false };
  const parsed = expeditionIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  if (!(await rateLimit(`expedition-reveal:${user.id}`, { limit: 20, windowSeconds: 60 }, { store: "memory" })).success) return { ok: false };
  return { ok: await markRevealedWith(prisma, { userId: user.id, expeditionId: parsed.data.id, now: new Date() }) };
}
