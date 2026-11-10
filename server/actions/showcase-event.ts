"use server";

import { refresh, updateTag } from "next/cache";
import { z } from "@/lib/zod";
import { isFrozen } from "@/lib/account/deletion";
import { getAdmin } from "../admin";
import { prisma } from "../db";
import {
  clearShowcaseVoteWith,
  enterShowcaseEventWith,
  removeShowcaseEntryByAdminWith,
  ShowcaseEventError,
  voteShowcaseEntryWith,
  withdrawShowcaseEntryWith,
} from "../event/showcase-core";
import { getShowcaseEventState, SHOWCASE_EVENT_TAG } from "../event/showcase-queries";
import { rateLimit } from "../ratelimit";
import { getSetting } from "../settings";
import { getCurrentUser } from "../user";

// Event vitrines. Ordre des contrôles : session → Zod → compte inscrit et actif → event allumé et en cours →
// rate limit → propriété et règles du vote, revérifiées sous verrou par server/event/showcase-core.ts.
// Le client n'envoie que des ids ; la photo de la vitrine et le décompte se font côté serveur.

export type ShowcaseEventActionError =
  | "NO_SESSION"
  | "INVALID"
  | "GUEST"
  | "UNAVAILABLE"
  | "CLOSED"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "TOO_FEW_CARDS"
  | "ALREADY_ENTERED"
  | "OWN_ENTRY";

export type ShowcaseEventResult = { ok: true } | { ok: false; error: ShowcaseEventActionError };
export type AdminShowcaseEventResult = { ok: true } | { ok: false; error: "FORBIDDEN" | "INVALID" | "RATE_LIMITED" | "NOT_FOUND" | "UNAVAILABLE" };

const idSchema = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const showcaseInput = z.object({ showcaseId: idSchema }).strict();
const entryInput = z.object({ entryId: idSchema }).strict();
const emptyInput = z.object({}).strict();

// Inscription et retrait : rares ; votes : un joueur peut hésiter entre plusieurs vitrines
const LIMITS = {
  entry: { key: "event-entry", limit: 10, windowSeconds: 3600 },
  vote: { key: "event-vote", limit: 30, windowSeconds: 60 },
} as const;

type Guarded<T> =
  | { ok: false; error: ShowcaseEventActionError }
  | { ok: true; userId: string; data: T; state: Awaited<ReturnType<typeof getShowcaseEventState>> };

async function guard<T>(input: unknown, schema: z.ZodType<T>, bucket: keyof typeof LIMITS): Promise<Guarded<T>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (user.isGuest) return { ok: false, error: "GUEST" };
  if (user.bannedAt || isFrozen(user)) return { ok: false, error: "UNAVAILABLE" };
  const state = await getShowcaseEventState();
  if (!state.enabled || state.phase !== "live") return { ok: false, error: "CLOSED" };
  const { key, limit, windowSeconds } = LIMITS[bucket];
  if (!(await rateLimit(`${key}:${user.id}`, { limit, windowSeconds })).success) return { ok: false, error: "RATE_LIMITED" };
  return { ok: true, userId: user.id, data: parsed.data, state };
}

function failure(e: unknown): { ok: false; error: ShowcaseEventActionError } {
  if (e instanceof ShowcaseEventError) return { ok: false, error: e.code === "NO_USER" ? "UNAVAILABLE" : e.code };
  console.error("[event vitrines] action impossible", e);
  return { ok: false, error: "UNAVAILABLE" };
}

/** Inscrit une vitrine du joueur : elle est photographiée telle qu'elle est maintenant. */
export async function enterShowcaseEventAction(input: unknown): Promise<ShowcaseEventResult> {
  const g = await guard(input, showcaseInput, "entry");
  if (!g.ok) return { ok: false, error: g.error };
  try {
    await enterShowcaseEventWith(prisma, {
      userId: g.userId,
      showcaseId: g.data.showcaseId,
      edition: g.state.edition,
      minCards: g.state.minCards,
      themes: await getSetting("showcase.themes"),
    });
  } catch (e) {
    return failure(e);
  }
  refresh();
  return { ok: true };
}

/** Retire la participation du joueur (et les votes qu'elle avait reçus). */
export async function withdrawShowcaseEntryAction(input: unknown): Promise<ShowcaseEventResult> {
  const g = await guard(input, emptyInput, "entry");
  if (!g.ok) return { ok: false, error: g.error };
  try {
    await withdrawShowcaseEntryWith(prisma, { userId: g.userId, edition: g.state.edition });
  } catch (e) {
    return failure(e);
  }
  refresh();
  return { ok: true };
}

/** Vote pour une vitrine (remplace le vote précédent du joueur). */
export async function voteShowcaseEntryAction(input: unknown): Promise<ShowcaseEventResult> {
  const g = await guard(input, entryInput, "vote");
  if (!g.ok) return { ok: false, error: g.error };
  try {
    await voteShowcaseEntryWith(prisma, { voterId: g.userId, edition: g.state.edition, entryId: g.data.entryId, enabled: g.state.enabled, phase: g.state.phase });
  } catch (e) {
    return failure(e);
  }
  refresh();
  return { ok: true };
}

/** Retire le vote du joueur. */
export async function clearShowcaseVoteAction(input: unknown): Promise<ShowcaseEventResult> {
  const g = await guard(input, emptyInput, "vote");
  if (!g.ok) return { ok: false, error: g.error };
  try {
    await clearShowcaseVoteWith(prisma, { voterId: g.userId, edition: g.state.edition });
  } catch (e) {
    return failure(e);
  }
  refresh();
  return { ok: true };
}

/** Admin : retire une inscription (modération), ses votes avec, et journalise. */
export async function removeShowcaseEntryAction(input: unknown): Promise<AdminShowcaseEventResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  const parsed = entryInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`admin:${admin.id}`, { limit: 20, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };
  try {
    await removeShowcaseEntryByAdminWith(prisma, { adminId: admin.id, entryId: parsed.data.entryId });
  } catch (e) {
    if (e instanceof ShowcaseEventError && e.code === "NOT_FOUND") return { ok: false, error: "NOT_FOUND" };
    console.error("[event vitrines] retrait admin impossible", e);
    return { ok: false, error: "UNAVAILABLE" };
  }
  updateTag(SHOWCASE_EVENT_TAG);
  refresh();
  return { ok: true };
}
