"use server";

import { getLocale } from "next-intl/server";
import { refresh } from "next/cache";
import { z } from "@/lib/zod";
import type { OpenedCardView } from "@/lib/boosters/view";
import { parseLedgerFilter } from "@/lib/economy/ledger-view";
import { isFrozen } from "@/lib/account/deletion";
import { cardViews } from "../boosters/display";
import { normalizeReferralCode } from "@/lib/economy/referral";
import { prisma } from "../db";
import { lotDeps } from "../economy/deps";
import { LotError, type LotGrant } from "../economy/lots";
import { claimMissionWith, MissionError } from "../economy/missions-core";
import { listLedger, type LedgerRow } from "../economy/queries";
import { attachReferral, qualifyLater } from "../economy/referral";
import { claimReferralWith, ReferralError } from "../economy/referral-core";
import { buyWithZeniWith, ShopError } from "../economy/shop-core";
import { rateLimit } from "../ratelimit";
import { getSetting } from "../settings";
import { getCurrentUser, requireActiveUser } from "../user";

// Missions, boutique, parrainage et historique des Zeni. Ordre des contrôles : session → Zod →
// propriété → rate limit, puis tout est relu sous verrou dans la transaction (server/economy).
// Le client n'envoie que des ids et le prix qu'il a vu : montants, lots et soldes sont décidés ici.

export type EconomyActionError =
  | "NO_SESSION"
  | "INVALID"
  | "DISABLED"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  // Missions
  | "NOT_DONE"
  | "ALREADY_CLAIMED"
  // Boutique
  | "NOT_FOR_SALE"
  | "STALE"
  | "LIMIT_REACHED"
  | "NOT_ENOUGH_ZENI"
  // Parrainage
  | "GUEST"
  | "SELF"
  | "ALREADY_REFERRED"
  | "TOO_LATE"
  | "INVALID_CODE"
  | "REFERRER_FULL"
  | "NOT_QUALIFIED"
  | "NO_REWARD";

type Failure = { ok: false; error: EconomyActionError };

/** Ce que le joueur vient de recevoir : message de confirmation et cartes à révéler. */
export type RewardSummary = { zeni: number; boosters: number; cards: OpenedCardView[] };

const idSchema = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const MINUTE = 60;

async function summarize(grant: LotGrant): Promise<RewardSummary> {
  const views = grant.cards.length ? await cardViews(grant.cards.map((c) => c.cardId), await getLocale()) : new Map();
  return {
    zeni: grant.zeni,
    boosters: grant.boosters.reduce((s, b) => s + b.count, 0),
    cards: grant.cards.flatMap((c) => {
      const view = views.get(c.cardId);
      return view ? [{ ...view, userCardId: c.userCardId, isNew: c.isNew, wished: c.wished, featured: false }] : [];
    }),
  };
}

type Player = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

async function session(
  bucket: string,
  rule: { limit: number; windowSeconds: number },
): Promise<{ user: Player } | { error: "NO_SESSION" | "UNAVAILABLE" | "RATE_LIMITED" }> {
  const user = await getCurrentUser();
  if (!user) return { error: "NO_SESSION" };
  if (user.bannedAt || isFrozen(user)) return { error: "UNAVAILABLE" };
  if (!(await rateLimit(`${bucket}:${user.id}`, rule)).success) return { error: "RATE_LIMITED" };
  return { user };
}

function unexpected(scope: string, e: unknown): Failure {
  // Lot supprimé ou mal formé : erreur de configuration, détails dans les logs seulement
  if (!(e instanceof LotError)) console.error(`[economie] ${scope}`, e);
  else console.error(`[economie] ${scope} : lot introuvable`);
  return { ok: false, error: "UNAVAILABLE" };
}

// --- Missions ---

export type ClaimResult = { ok: true; reward: RewardSummary } | Failure;

const claimMissionSchema = z.object({ missionId: idSchema }).strict();

export async function claimMissionAction(input: unknown): Promise<ClaimResult> {
  const parsed = claimMissionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const g = await session("mission", { limit: 20, windowSeconds: MINUTE });
  if ("error" in g) return { ok: false, error: g.error };
  if (!(await getSetting("missions.enabled"))) return { ok: false, error: "DISABLED" };
  try {
    // Propriété : la réclamation porte toujours sur le joueur de la session
    const { grant } = await claimMissionWith(
      prisma,
      { userId: g.user.id, missionId: parsed.data.missionId, now: new Date(), timeZone: await getSetting("game.timeZone") },
      lotDeps(),
    );
    refresh();
    return { ok: true, reward: await summarize(grant) };
  } catch (e) {
    if (e instanceof MissionError) {
      if (e.code === "NOT_DONE" || e.code === "ALREADY_CLAIMED") return { ok: false, error: e.code };
      return { ok: false, error: e.code === "NOT_FOUND" ? "INVALID" : "UNAVAILABLE" };
    }
    return unexpected("mission", e);
  }
}

// --- Boutique ---

export type BuyResult = { ok: true; reward: RewardSummary; coins: number } | Failure;

const buySchema = z.object({ shopItemId: idSchema, expectedPrice: z.number().int().min(1).max(10_000_000) }).strict();

export async function buyShopItemAction(input: unknown): Promise<BuyResult> {
  const parsed = buySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const g = await session("shop", { limit: 10, windowSeconds: MINUTE });
  if ("error" in g) return { ok: false, error: g.error };
  if (!(await getSetting("shop.enabled"))) return { ok: false, error: "DISABLED" };
  try {
    const { grant, coins } = await buyWithZeniWith(
      prisma,
      {
        userId: g.user.id,
        shopItemId: parsed.data.shopItemId,
        expectedPrice: parsed.data.expectedPrice,
        now: new Date(),
        timeZone: await getSetting("game.timeZone"),
      },
      lotDeps(),
    );
    refresh();
    return { ok: true, reward: await summarize(grant), coins };
  } catch (e) {
    if (e instanceof ShopError) {
      if (e.code === "NO_USER" || e.code === "BANNED") return { ok: false, error: "UNAVAILABLE" };
      return { ok: false, error: e.code };
    }
    return unexpected("achat", e);
  }
}

// --- Parrainage ---

export type SimpleResult = { ok: true } | Failure;

const attachSchema = z.object({ code: z.string().min(1).max(32) }).strict();

/** Saisie manuelle d'un code de parrainage (comptes inscrits, dans les jours qui suivent l'inscription). */
export async function attachReferralAction(input: unknown): Promise<SimpleResult> {
  const parsed = attachSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const code = normalizeReferralCode(parsed.data.code);
  if (!code) return { ok: false, error: "INVALID_CODE" };
  // Par joueur en plus de la limite par IP : on ne devine pas les codes en série
  const g = await session("referral-attach", { limit: 5, windowSeconds: 3600 });
  if ("error" in g) return { ok: false, error: g.error };
  if (g.user.isGuest) return { ok: false, error: "GUEST" };
  try {
    const result = await attachReferral(g.user.id, code);
    if (!result.ok) {
      const error = result.error;
      if (error === "NO_USER" || error === "BANNED" || error === "NOT_FOUND" || error === "NOT_QUALIFIED") {
        return { ok: false, error: "UNAVAILABLE" };
      }
      return { ok: false, error };
    }
    qualifyLater(g.user.id);
    refresh();
    return { ok: true };
  } catch (e) {
    return unexpected("rattachement", e);
  }
}

export type ClaimReferralResult = { ok: true; reward: RewardSummary } | Failure;

const claimReferralSchema = z.object({ referralId: idSchema }).strict();

export async function claimReferralAction(input: unknown): Promise<ClaimReferralResult> {
  const parsed = claimReferralSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const g = await session("referral-claim", { limit: 20, windowSeconds: MINUTE });
  if ("error" in g) return { ok: false, error: g.error };
  if (!(await getSetting("referral.enabled"))) return { ok: false, error: "DISABLED" };

  // Le lot dépend du côté du joueur : relu en base ici, revérifié dans la transaction
  const referral = await prisma.referral.findUnique({
    where: { id: parsed.data.referralId },
    select: { referrerId: true, refereeId: true },
  });
  const side = referral?.referrerId === g.user.id ? "referrer" : referral?.refereeId === g.user.id ? "referee" : null;
  if (!side) return { ok: false, error: "INVALID" };
  const lotId = await getSetting(side === "referrer" ? "referral.referrerLotId" : "referral.refereeLotId");

  try {
    const { grant } = await claimReferralWith(
      prisma,
      { userId: g.user.id, referralId: parsed.data.referralId, lotId, now: new Date() },
      lotDeps(),
    );
    refresh();
    return { ok: true, reward: await summarize(grant) };
  } catch (e) {
    if (e instanceof ReferralError) {
      switch (e.code) {
        case "NOT_QUALIFIED":
        case "ALREADY_CLAIMED":
        case "NO_REWARD":
          return { ok: false, error: e.code };
        case "NOT_FOUND":
          return { ok: false, error: "INVALID" };
        default:
          return { ok: false, error: "UNAVAILABLE" };
      }
    }
    return unexpected("parrainage", e);
  }
}

// --- Historique des Zeni ---

export type LedgerPageResult = { ok: true; items: LedgerRow[]; nextCursor: string | null } | Failure;

const ledgerSchema = z.object({ filter: z.string().max(20), cursor: idSchema.nullable() }).strict();

/** Pages suivantes de l'historique (la première est rendue par le serveur). */
export async function loadLedgerPageAction(input: unknown): Promise<LedgerPageResult> {
  const parsed = ledgerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const user = await requireActiveUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  if (!(await rateLimit(`ledger:${user.id}`, { limit: 60, windowSeconds: MINUTE })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  const page = await listLedger(user.id, parseLedgerFilter(parsed.data.filter), parsed.data.cursor);
  return { ok: true, ...page };
}
