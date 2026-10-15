"use server";

import { z } from "zod";
import { TEAM_SIZE } from "@/lib/battle/types";
import type { Activity, BattleUpdateView, BattleView } from "@/lib/battle/view";
import { prisma } from "../db";
import {
  BattleError,
  cancelRoomWith,
  claimTimeoutWith,
  createRoomWith,
  joinQueueWith,
  joinRoomWith,
  leaveQueueWith,
  normalizeCode,
  playActionWith,
  pollQueueWith,
  startBotBattleWith,
  type BattleErrorCode,
  type BattleUpdate,
  type QueueStatus,
} from "../battle/battle-core";
import { battleCtx, getActivity, getBattleView, getUpdateSince, sweepBattlesFor } from "../battle/queries";
import { publishBattle, publishMatched, toMessage } from "../battle/realtime";
import { pushLater } from "../market/queries";
import { rateLimit } from "../ratelimit";
import { getCurrentUser } from "../user";

// Combat 1v1. Ordre des contrôles : Zod → session → rate limit, puis tout est relu sous verrou dans
// la transaction (server/battle/battle-core.ts). Le client n'envoie que des ids de Card, un code,
// l'id d'une partie, la version qu'il a vue et une intention : le camp est toujours celui de la
// session, la légalité du coup est revérifiée par le moteur, les dégâts sont tirés ici.

export type BattleActionError =
  | Exclude<BattleErrorCode, "NO_USER" | "BANNED" | "ILLEGAL">
  | "NO_SESSION"
  | "INVALID"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "ILLEGAL";

type Failure = { ok: false; error: BattleActionError; battleId?: string };

const MINUTE = 60;
const idSchema = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const teamSchema = z.array(idSchema).length(TEAM_SIZE);
const slot = z.number().int().min(0).max(TEAM_SIZE - 1);

type Player = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

async function session(
  bucket: string,
  rule: { limit: number; windowSeconds: number },
): Promise<{ user: Player } | { error: "NO_SESSION" | "UNAVAILABLE" | "RATE_LIMITED" | "GUEST" }> {
  const user = await getCurrentUser();
  if (!user) return { error: "NO_SESSION" };
  if (user.bannedAt) return { error: "UNAVAILABLE" };
  // Les invités regardent ; la transaction le revérifie
  if (user.isGuest) return { error: "GUEST" };
  if (!(await rateLimit(`${bucket}:${user.id}`, rule)).success) return { error: "RATE_LIMITED" };
  return { user };
}

function failure(scope: string, e: unknown): Failure {
  if (e instanceof BattleError) {
    if (e.code === "NO_USER" || e.code === "BANNED") return { ok: false, error: "UNAVAILABLE" };
    // Partie déjà en cours : l'écran y renvoie le joueur
    if (e.code === "IN_BATTLE") return { ok: false, error: "IN_BATTLE", battleId: e.detail };
    return { ok: false, error: e.code };
  }
  console.error(`[combat] ${scope}`, e);
  return { ok: false, error: "UNAVAILABLE" };
}

/** Prévient les deux joueurs (Ably) d'une partie qui vient de démarrer. */
async function announceStart(u: BattleUpdate) {
  const b = await prisma.battle.findUnique({ where: { id: u.battleId }, select: { p1Id: true, p2Id: true } });
  await Promise.all([publishMatched(b!.p1Id, u.battleId), b?.p2Id ? publishMatched(b.p2Id, u.battleId) : null, publishBattle(u)]);
}

// --- File d'attente ---

export type QueueResult =
  | { ok: true; state: "MATCHED"; battleId: string }
  | { ok: true; state: "WAITING"; joinedAt: string; botAt: string }
  | { ok: true; state: "NONE" }
  | Failure;

async function queueResult(s: QueueStatus): Promise<QueueResult> {
  if (s.state === "MATCHED") {
    if (s.update) await announceStart(s.update);
    return { ok: true, state: "MATCHED", battleId: s.battleId };
  }
  if (s.state === "WAITING") return { ok: true, state: "WAITING", joinedAt: s.joinedAt.toISOString(), botAt: s.botAt.toISOString() };
  return { ok: true, state: "NONE" };
}

const joinQueueSchema = z.object({ cardIds: teamSchema, mode: z.literal("EXHIBITION") }).strict();

export async function joinQueueAction(input: unknown): Promise<QueueResult> {
  const parsed = joinQueueSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const g = await session("battle-queue", { limit: 12, windowSeconds: MINUTE });
  if ("error" in g) return { ok: false, error: g.error };
  try {
    return await queueResult(await joinQueueWith(prisma, { userId: g.user.id, ...parsed.data }, await battleCtx()));
  } catch (e) {
    return failure("file", e);
  }
}

/** Sondé par l'écran d'attente : présence + nouvel essai d'appariement. */
export async function pollQueueAction(): Promise<QueueResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  if (!(await rateLimit(`battle-queue-poll:${user.id}`, { limit: 40, windowSeconds: MINUTE })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  try {
    return await queueResult(await pollQueueWith(prisma, { userId: user.id }, await battleCtx()));
  } catch (e) {
    return failure("sondage de file", e);
  }
}

export async function leaveQueueAction(): Promise<QueueResult> {
  const g = await session("battle-queue", { limit: 12, windowSeconds: MINUTE });
  if ("error" in g) return { ok: false, error: g.error };
  try {
    return await queueResult(await leaveQueueWith(prisma, { userId: g.user.id }));
  } catch (e) {
    return failure("sortie de file", e);
  }
}

export type StartResult = { ok: true; battleId: string } | Failure;

export async function startBotBattleAction(): Promise<StartResult> {
  const g = await session("battle-queue", { limit: 12, windowSeconds: MINUTE });
  if ("error" in g) return { ok: false, error: g.error };
  try {
    const u = await startBotBattleWith(prisma, { userId: g.user.id }, await battleCtx());
    await announceStart(u);
    return { ok: true, battleId: u.battleId };
  } catch (e) {
    return failure("bot", e);
  }
}

// --- Salles d'amis ---

export type RoomResult = { ok: true; battleId: string } | Failure;

const createRoomSchema = z.object({ cardIds: teamSchema, inviteeId: idSchema.nullable() }).strict();

export async function createRoomAction(input: unknown): Promise<RoomResult> {
  const parsed = createRoomSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const g = await session("battle-room", { limit: 6, windowSeconds: MINUTE });
  if ("error" in g) return { ok: false, error: g.error };
  try {
    const room = await createRoomWith(prisma, { userId: g.user.id, ...parsed.data }, await battleCtx(), pushLater);
    return { ok: true, battleId: room.battleId };
  } catch (e) {
    return failure("salle", e);
  }
}

const joinRoomSchema = z
  .object({ cardIds: teamSchema, code: z.string().min(1).max(12).optional(), battleId: idSchema.optional() })
  .strict()
  .refine((v) => Boolean(v.code) !== Boolean(v.battleId));

export async function joinRoomAction(input: unknown): Promise<RoomResult> {
  const parsed = joinRoomSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const code = parsed.data.code ? normalizeCode(parsed.data.code) : undefined;
  if (code === null) return { ok: false, error: "NOT_FOUND" };
  const g = await session("battle-room", { limit: 6, windowSeconds: MINUTE });
  if ("error" in g) return { ok: false, error: g.error };
  try {
    const u = await joinRoomWith(
      prisma,
      { userId: g.user.id, cardIds: parsed.data.cardIds, code, battleId: parsed.data.battleId },
      await battleCtx(),
    );
    await announceStart(u);
    return { ok: true, battleId: u.battleId };
  } catch (e) {
    return failure("rejoindre", e);
  }
}

const battleSchema = z.object({ battleId: idSchema }).strict();

export async function cancelRoomAction(input: unknown): Promise<{ ok: true } | Failure> {
  const parsed = battleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const g = await session("battle-room", { limit: 6, windowSeconds: MINUTE });
  if ("error" in g) return { ok: false, error: g.error };
  try {
    await cancelRoomWith(prisma, { userId: g.user.id, battleId: parsed.data.battleId }, await battleCtx());
    return { ok: true };
  } catch (e) {
    return failure("fermeture de salle", e);
  }
}

// --- En partie ---

export type PlayResult = { ok: true; update: BattleUpdateView } | Failure;

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ATTACK"), actor: slot, target: slot }).strict(),
  z.object({ type: z.literal("TECHNIQUE"), actor: slot, target: slot.optional() }).strict(),
  z.object({ type: z.literal("END_TURN") }).strict(),
  z.object({ type: z.literal("FORFEIT") }).strict(),
]);

const playSchema = z.object({ battleId: idSchema, version: z.number().int().min(0).max(100_000), action: actionSchema }).strict();

export async function playAction(input: unknown): Promise<PlayResult> {
  const parsed = playSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const g = await session("battle-action", { limit: 40, windowSeconds: MINUTE });
  if ("error" in g) return { ok: false, error: g.error };
  try {
    const u = await playActionWith(prisma, { userId: g.user.id, ...parsed.data }, await battleCtx());
    await publishBattle(u);
    return { ok: true, update: toMessage(u) };
  } catch (e) {
    return failure("action", e);
  }
}

/** Le minuteur client est à zéro : le serveur vérifie l'échéance et termine le tour. */
export async function claimTimeoutAction(input: unknown): Promise<PlayResult | { ok: true; update: null }> {
  const parsed = battleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const g = await session("battle-action", { limit: 40, windowSeconds: MINUTE });
  if ("error" in g) return { ok: false, error: g.error };
  try {
    const u = await claimTimeoutWith(prisma, { userId: g.user.id, battleId: parsed.data.battleId }, await battleCtx());
    if (!u) return { ok: true, update: null };
    await publishBattle(u);
    return { ok: true, update: toMessage(u) };
  } catch (e) {
    return failure("minuteur", e);
  }
}

export type ViewResult = { ok: true; view: BattleView } | Failure;

/** Resynchronisation (rechargement, message Ably manqué, sondage sans Ably). Consultation ouverte aux invités participants. */
export async function battleViewAction(input: unknown): Promise<ViewResult> {
  const parsed = battleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  if (!(await rateLimit(`battle-view:${user.id}`, { limit: 90, windowSeconds: MINUTE })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  await sweepBattlesFor(user.id);
  const ctx = await battleCtx();
  const view = await getBattleView(parsed.data.battleId, user.id, ctx.rules);
  return view ? { ok: true, view } : { ok: false, error: "NOT_FOUND" };
}

export type SinceResult = { ok: true; update: BattleUpdateView | null } | Failure;

const sinceSchema = z.object({ battleId: idSchema, version: z.number().int().min(0).max(100_000) }).strict();

/** Événements manqués depuis `version` (sondage sans Ably, ou trou dans les messages temps réel). */
export async function battleSinceAction(input: unknown): Promise<SinceResult> {
  const parsed = sinceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  if (!(await rateLimit(`battle-view:${user.id}`, { limit: 90, windowSeconds: MINUTE })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  await sweepBattlesFor(user.id);
  return { ok: true, update: await getUpdateSince(parsed.data.battleId, user.id, parsed.data.version) };
}

export type ActivityResult = { ok: true; activity: Activity } | Failure;

export async function activityAction(): Promise<ActivityResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const ctx = await battleCtx();
  return { ok: true, activity: await getActivity(user.id, ctx.rules.queueSeconds) };
}
