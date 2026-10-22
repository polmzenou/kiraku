"use server";

import { refresh } from "next/cache";
import { noteSchema } from "@/lib/text/plain";
import { z } from "@/lib/zod";
import { USERNAME_REGEX } from "@/lib/username";
import { getAdmin } from "../admin";
import { prisma } from "../db";
import { lotDeps } from "../economy/deps";
import {
  BROADCAST_AUDIENCES,
  grantLotToUserWith,
  LotGrantError,
  runLotBroadcastWith,
  startLotBroadcastWith,
  type LotGrantErrorCode,
} from "../economy/lot-grant-core";
import { pushLater } from "../market/queries";
import { rateLimit } from "../ratelimit";

// Envoi de lots depuis /admin/lots. Ordre : rôle admin → Zod → rate limit. Les versements et
// l'AdminLog sont écrits par lot-grant-core, dans la transaction de chaque versement.

export type AdminLotError = "FORBIDDEN" | "INVALID" | "RATE_LIMITED" | "CONFIRM_MISMATCH" | LotGrantErrorCode;
export type AdminLotResult =
  | { ok: true; granted?: number; done?: boolean; broadcastId?: string }
  | { ok: false; error: AdminLotError };

const id = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const reason = z.string().trim().max(200).transform((r) => (r === "" ? null : r));
// Budget d'un appel : un envoi à tous se poursuit par « Reprendre »
const BUDGET_MS = 20_000;

const userSchema = z.object({ lotId: id, username: z.string().trim().regex(USERNAME_REGEX), reason, message: noteSchema });
const broadcastSchema = z.object({ lotId: id, audience: z.enum(BROADCAST_AUDIENCES), reason, message: noteSchema, confirm: z.string().max(20) });
const resumeSchema = z.object({ broadcastId: id });

const limited = async (adminId: string) => !(await rateLimit(`admin:${adminId}`, { limit: 20, windowSeconds: 60 })).success;

function failure(e: unknown): { ok: false; error: AdminLotError } {
  if (e instanceof LotGrantError) return { ok: false, error: e.code };
  throw e;
}

/** Verse un lot à un joueur désigné par son pseudo. */
export async function grantLotToUserAction(input: unknown): Promise<AdminLotResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  const parsed = userSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (await limited(admin.id)) return { ok: false, error: "RATE_LIMITED" };

  const user = await prisma.user.findFirst({
    where: { username: { equals: parsed.data.username, mode: "insensitive" } },
    select: { id: true },
  });
  if (!user) return { ok: false, error: "NO_USER" };
  try {
    await grantLotToUserWith(
      prisma,
      { adminId: admin.id, lotId: parsed.data.lotId, userId: user.id, reason: parsed.data.reason, message: parsed.data.message, now: new Date() },
      lotDeps(),
      pushLater,
    );
  } catch (e) {
    return failure(e);
  }
  refresh();
  return { ok: true, granted: 1 };
}

/** Ouvre un envoi à tous (confirmé en tapant « TOUS ») et traite un premier paquet. */
export async function startLotBroadcastAction(input: unknown): Promise<AdminLotResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  const parsed = broadcastSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (await limited(admin.id)) return { ok: false, error: "RATE_LIMITED" };
  if (parsed.data.confirm.trim().toUpperCase() !== "TOUS" && parsed.data.confirm.trim().toUpperCase() !== "ALL") {
    return { ok: false, error: "CONFIRM_MISMATCH" };
  }
  try {
    const { broadcastId } = await startLotBroadcastWith(prisma, {
      adminId: admin.id,
      lotId: parsed.data.lotId,
      audience: parsed.data.audience,
      reason: parsed.data.reason,
      message: parsed.data.message,
    });
    const run = await runLotBroadcastWith(prisma, { broadcastId, now: new Date(), budgetMs: BUDGET_MS }, lotDeps(), pushLater);
    refresh();
    return { ok: true, broadcastId, ...run };
  } catch (e) {
    return failure(e);
  }
}

/** Reprend un envoi à tous interrompu (budget de temps atteint, coupure). */
export async function resumeLotBroadcastAction(input: unknown): Promise<AdminLotResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  const parsed = resumeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (await limited(admin.id)) return { ok: false, error: "RATE_LIMITED" };
  try {
    const run = await runLotBroadcastWith(prisma, { broadcastId: parsed.data.broadcastId, now: new Date(), budgetMs: BUDGET_MS }, lotDeps(), pushLater);
    refresh();
    return { ok: true, ...run };
  } catch (e) {
    return failure(e);
  }
}
