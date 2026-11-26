"use server";

import { getLocale } from "next-intl/server";
import { refresh } from "next/cache";
import { after } from "next/server";
import { isFrozen } from "@/lib/account/deletion";
import { isStaff } from "@/lib/admin/roles";
import type { OpenedCardView } from "@/lib/boosters/view";
import { casinoAccess } from "@/lib/casino/phase";
import { mineSignature } from "@/lib/casino/view";
import { USERNAME_REGEX } from "@/lib/username";
import { z } from "@/lib/zod";
import { getAdmin } from "../admin";
import { cardViews } from "../boosters/display";
import {
  adminCancelTableWith,
  cancelTableWith,
  CoinFlipError,
  createTableWith,
  declineTableWith,
  joinTableWith,
  markSeenWith,
  sweepCasinoWith,
  type CoinFlipErrorCode,
} from "../casino/coinflip-core";
import { coinFlipContext } from "../casino/deps";
import { getCasinoRules, getTable, listLobby, myTablesState, recentFlips, type CoinFlipTableView, type FeedEntry, type LobbyPage } from "../casino/queries";
import { prisma } from "../db";
import { pushLater } from "../push/send";
import { rateLimit } from "../ratelimit";
import { publishToUser } from "../realtime";
import { getCurrentUser } from "../user";

// Pile ou face. Ordre des contrôles : session → Zod (.strict()) → compte inscrit non banni → casino ouvert
// (ou aperçu de l'équipe) et jeu allumé → rate limit → règles relues sous verrou (server/casino/coinflip-core.ts).
// Le client n'envoie que des ids de cartes et de tables, une face et un pseudo : le serveur choisit
// l'exemplaire, tire la graine et lance la pièce.

export type CasinoActionError = CoinFlipErrorCode | "NO_SESSION" | "INVALID" | "RATE_LIMITED" | "UNAVAILABLE" | "FORBIDDEN";
type Failure = { ok: false; error: CasinoActionError };

const id = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const side = z.enum(["OMOTE", "URA"]);
const createSchema = z
  // userCardId : exemplaire désigné, obligatoire pour miser une pièce spéciale (héritière ou gravée)
  .object({ cardId: id, userCardId: id.nullish(), side, reservedFor: z.string().regex(USERNAME_REGEX).nullable(), confirmLastCopy: z.boolean() })
  .strict();
const joinSchema = z.object({ flipId: id, cardId: id, userCardId: id.nullish(), confirmLastCopy: z.boolean() }).strict();
const flipIdSchema = z.object({ flipId: id }).strict();
const seenSchema = z.object({ flipIds: z.array(id).min(1).max(20) }).strict();
const adminCancelSchema = z.object({ flipId: id, reason: z.string().trim().min(3).max(200) }).strict();
const emptySchema = z.object({}).strict();
const lobbySchema = z.object({ tier: z.number().int().min(-100_000).max(100_000).nullable(), cursor: id.nullable() }).strict();

const MINUTE = 60;

type Rule = { limit: number; windowSeconds: number };

/** Session, schéma, compte inscrit actif, casino ouvert (ou aperçu de l'équipe) et jeu allumé, rate limit. */
async function guard<S extends z.ZodType>(input: unknown, schema: S, bucket: string, rule: Rule, store: "db" | "memory" = "db", opts: { guests?: boolean } = {}) {
  const user = await getCurrentUser();
  if (!user) return { error: "NO_SESSION" as const };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "INVALID" as const };
  // Lecture seule (salon) : un invité voit les tables se mettre à jour ; il ne peut ni poser ni relever
  if (user.isGuest && !opts.guests) return { error: "GUEST" as const };
  if (user.bannedAt || isFrozen(user)) return { error: "UNAVAILABLE" as const };
  const rules = await getCasinoRules();
  if (!casinoAccess(rules, Date.now(), isStaff(user.role)).canEnter) return { error: "CLOSED" as const };
  if (!(await rateLimit(`${bucket}:${user.id}`, rule, { store })).success) return { error: "RATE_LIMITED" as const };
  return { user, data: parsed.data as z.infer<S> };
}

function failure(e: unknown): Failure {
  if (e instanceof CoinFlipError) return { ok: false, error: e.code };
  console.error("[casino] action impossible", e);
  return { ok: false, error: "UNAVAILABLE" };
}

/** Pose une fuda sur une table et choisit sa face ; `reservedFor` réserve la table à un ami ou à un ancien adversaire. */
export async function createCoinFlipAction(input: unknown): Promise<{ ok: true; flipId: string } | Failure> {
  const g = await guard(input, createSchema, "coinflip-create", { limit: 6, windowSeconds: MINUTE });
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  try {
    let reservedForId: string | null = null;
    if (g.data.reservedFor) {
      // Comparaison sans la casse, puis contrôle exact : un « _ » du pseudo ne doit jamais servir de joker
      const wanted = g.data.reservedFor.toLowerCase();
      const candidates = await prisma.user.findMany({ where: { username: { equals: g.data.reservedFor, mode: "insensitive" } }, select: { id: true, username: true }, take: 5 });
      const target = candidates.find((c) => c.username.toLowerCase() === wanted);
      if (!target) return { ok: false, error: "RESERVE_TARGET" };
      reservedForId = target.id;
    }
    const { flipId } = await createTableWith(
      prisma,
      { userId: g.user.id, cardId: g.data.cardId, userCardId: g.data.userCardId ?? null, side: g.data.side, reservedForId, confirmLastCopy: g.data.confirmLastCopy },
      await coinFlipContext(),
      pushLater,
    );
    refresh();
    return { ok: true, flipId };
  } catch (e) {
    return failure(e);
  }
}

export type JoinResult = {
  ok: true;
  flipId: string;
  /** La table jouée, pour l'animation ; null si sa relecture a échoué (la page de la table, rechargée, montre le résultat). */
  table: CoinFlipTableView | null;
  won: boolean;
  /** Carte remportée (celle de l'autre joueur), à révéler si le lecteur gagne. */
  prize: OpenedCardView | null;
};

/** Relève une table avec une fuda du même palier : la pièce est lancée sur le serveur, l'animation suit. */
export async function joinCoinFlipAction(input: unknown): Promise<JoinResult | Failure> {
  const g = await guard(input, joinSchema, "coinflip-join", { limit: 12, windowSeconds: MINUTE });
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  let res: Awaited<ReturnType<typeof joinTableWith>>;
  try {
    res = await joinTableWith(
      prisma,
      { userId: g.user.id, flipId: g.data.flipId, cardId: g.data.cardId, userCardId: g.data.userCardId ?? null, confirmLastCopy: g.data.confirmLastCopy },
      await coinFlipContext(),
      pushLater,
    );
  } catch (e) {
    return failure(e);
  }
  refresh();
  if (!res.ok) return { ok: false, error: res.code };
  const played = res;
  // Les cartes ont déjà changé de main : le créateur qui attend sur la page de sa table voit le lancer en direct,
  // quoi qu'il arrive à la relecture
  after(() => publishToUser(played.creatorId, "coinflip", { flipId: played.flipId }));
  try {
    const locale = await getLocale();
    const [table, views] = await Promise.all([getTable(played.flipId, g.user.id, locale), cardViews([played.prize.cardId], locale)]);
    const view = views.get(played.prize.cardId);
    if (table && view) {
      return {
        ok: true,
        flipId: played.flipId,
        table,
        won: played.won,
        prize: { ...view, userCardId: played.prize.userCardId, isNew: played.prize.isNew, wished: played.prize.wished, featured: false },
      };
    }
  } catch (e) {
    console.error("[casino] relecture après une relève", e);
  }
  // Relève validée mais table ou carte illisible (carte repassée en brouillon…) : jamais « Action impossible »,
  // la page de la table se recharge et montre le résultat
  return { ok: true, flipId: played.flipId, table: null, won: played.won, prize: null };
}

/** Le créateur retire sa table ouverte : la carte revient dans sa collection. */
export async function cancelCoinFlipAction(input: unknown): Promise<{ ok: true } | Failure> {
  const g = await guard(input, flipIdSchema, "coinflip-respond", { limit: 20, windowSeconds: MINUTE });
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  try {
    await cancelTableWith(prisma, { userId: g.user.id, flipId: g.data.flipId }, { now: new Date() });
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

/** Le joueur invité décline une table qui lui est réservée. */
export async function declineCoinFlipAction(input: unknown): Promise<{ ok: true } | Failure> {
  const g = await guard(input, flipIdSchema, "coinflip-respond", { limit: 20, windowSeconds: MINUTE });
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  try {
    const { creatorId } = await declineTableWith(prisma, { userId: g.user.id, flipId: g.data.flipId }, { now: new Date() }, pushLater);
    // Le créateur qui attend sur la page de sa table la voit se fermer aussitôt
    after(() => publishToUser(creatorId, "coinflip", { flipId: g.data.flipId }));
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

/** Le créateur a vu ses lancers rejoués. Reste permis casino fermé : un replay ne doit jamais revenir en boucle. */
export async function markCoinFlipsSeenAction(input: unknown): Promise<{ ok: true } | Failure> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const parsed = seenSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`coinflip-seen:${user.id}`, { limit: 30, windowSeconds: MINUTE }, { store: "memory" })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  await markSeenWith(prisma, { userId: user.id, flipIds: parsed.data.flipIds, now: new Date() });
  // Vide le cache du routeur du créateur : « Mes tables » et le bandeau des replays ne reviennent pas périmés
  refresh();
  return { ok: true };
}

/** Sondage du salon (complété par le rechargement après chaque action). */
export async function coinFlipLobbyAction(input: unknown): Promise<{ ok: true; page: LobbyPage } | Failure> {
  const g = await guard(input, lobbySchema, "coinflip-lobby", { limit: 30, windowSeconds: MINUTE }, "memory", { guests: true });
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  const page = await listLobby({ viewerId: g.user.id, tier: g.data.tier, cursor: g.data.cursor, locale: await getLocale() });
  return { ok: true, page };
}

/**
 * Sondage du salon : empreinte de « Mes tables », des invitations et des replays. Le salon la compare à celle
 * de son rendu et se recharge si elle a changé (table relevée, retirée, échue, invitation reçue).
 */
export async function coinFlipMineAction(input: unknown): Promise<{ ok: true; signature: string } | Failure> {
  const g = await guard(input, emptySchema, "coinflip-mine", { limit: 30, windowSeconds: MINUTE }, "memory");
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  return { ok: true, signature: mineSignature(await myTablesState(g.user.id)) };
}

/**
 * Sondage de la page d'une table (secours du temps réel) : le créateur qui attend voit sa table relevée.
 * Ses tables échues sont balayées au passage, au plus une fois par minute.
 */
export async function coinFlipTableAction(input: unknown): Promise<{ ok: true; table: CoinFlipTableView } | Failure> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const parsed = flipIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`coinflip-table:${user.id}`, { limit: 40, windowSeconds: MINUTE }, { store: "memory" })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  if (!user.isGuest && (await rateLimit(`coinflip-sweep:${user.id}`, { limit: 1, windowSeconds: MINUTE }, { store: "memory" })).success) {
    await sweepCasinoWith(prisma, { now: new Date() }, { creatorId: user.id }, pushLater).catch((e) => console.error("[casino] balayage au sondage", e));
  }
  const table = await getTable(parsed.data.flipId, user.id, await getLocale());
  if (!table) return { ok: false, error: "NOT_FOUND" };
  return { ok: true, table };
}

/** Modération : retire une table ouverte avec un motif (journal) ; la carte revient, le créateur est prévenu. */
export async function adminCancelCoinFlipAction(input: unknown): Promise<{ ok: true } | Failure> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  const parsed = adminCancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`admin:${admin.id}`, { limit: 20, windowSeconds: MINUTE })).success) return { ok: false, error: "RATE_LIMITED" };
  try {
    const { creatorId } = await adminCancelTableWith(
      prisma,
      { adminId: admin.id, flipId: parsed.data.flipId, reason: parsed.data.reason },
      { now: new Date() },
      pushLater,
    );
    after(() => publishToUser(creatorId, "coinflip", { flipId: parsed.data.flipId }));
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

/** Sondage du fil « Derniers lancers » du hall (invités compris : ils regardent sans jouer). */
export async function coinFlipFeedAction(input: unknown): Promise<{ ok: true; entries: FeedEntry[] } | Failure> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  if (!emptySchema.safeParse(input).success) return { ok: false, error: "INVALID" };
  const rules = await getCasinoRules();
  if (!casinoAccess(rules, Date.now(), isStaff(user.role)).canEnter) return { ok: false, error: "CLOSED" };
  if (!(await rateLimit(`coinflip-feed:${user.id}`, { limit: 20, windowSeconds: MINUTE }, { store: "memory" })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  return { ok: true, entries: await recentFlips(await getLocale(), rules.coinflip) };
}
