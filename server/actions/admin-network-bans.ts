"use server";

import { refresh } from "next/cache";
import { GROUP_BAN_MAX } from "@/lib/anticheat/network";
import { z } from "@/lib/zod";
import { getAdmin } from "../admin";
import {
  banGroupWith,
  banNetworkWith,
  keepNetworkBanWith,
  liftNetworkBanWith,
  NetworkBanError,
  type NetworkBanErrorCode,
  type SkippedKey,
} from "../anticheat/network-ban-core";
import { prisma } from "../db";
import { rateLimit } from "../ratelimit";
import { refreshLeaderboardsAfterBan } from "../social/ban-caches";
import { getSetting } from "../settings";

// Bans réseau depuis l'admin : fiche joueur, groupes de /admin/multi-comptes, liste des bans. Ordre des contrôles :
// rôle ADMIN → Zod → rate limit, puis tout est relu sous verrou (server/anticheat/network-ban-core.ts). Le client
// n'envoie que des ids et une raison : les IP et appareils sont relus dans les relevés du compte visé.

export type NetworkBanActionError = NetworkBanErrorCode | "INVALID" | "RATE_LIMITED" | "UNAVAILABLE";
type Failure = { ok: false; error: NetworkBanActionError };

const id = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const reason = z.string().trim().min(1).max(300);
const MINUTE = 60;

function failure(scope: string, e: unknown): Failure {
  if (e instanceof NetworkBanError) return { ok: false, error: e.code };
  console.error(`[bans réseau] ${scope}`, e);
  return { ok: false, error: "UNAVAILABLE" };
}

const banSchema = z.object({ userId: id, signalIds: z.array(id).max(50), banAccount: z.boolean(), reason }).strict();

/** Fiche joueur : bannit les IP et appareils cochés de ce compte, et le compte si demandé. */
export async function banNetworkAction(input: unknown): Promise<{ ok: true; bans: number; account: boolean } | Failure> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  const parsed = banSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`admin-netban:${admin.id}`, { limit: 20, windowSeconds: MINUTE })).success) return { ok: false, error: "RATE_LIMITED" };
  try {
    const { userId, signalIds, banAccount, reason } = parsed.data;
    const sharedIpCap = await getSetting("multiAccount.sharedIpCap");
    const res = await banNetworkWith(prisma, { adminId: admin.id, userId, signalIds, banAccount, reason, now: new Date(), sharedIpCap });
    if (res.account) refreshLeaderboardsAfterBan();
    refresh();
    return { ok: true, bans: res.bans, account: res.account };
  } catch (e) {
    return failure("fiche joueur", e);
  }
}

const groupSchema = z.object({ userIds: z.array(id).min(2).max(GROUP_BAN_MAX), reason }).strict();

/** Groupe suspect : bannit tous ses comptes et ce qui, de leur réseau, ne coupe personne d'autre. */
export async function banGroupAction(input: unknown): Promise<{ ok: true; accounts: number; bans: number; skipped: SkippedKey[] } | Failure> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`admin-netban-group:${admin.id}`, { limit: 10, windowSeconds: MINUTE })).success) return { ok: false, error: "RATE_LIMITED" };
  try {
    const sharedIpCap = await getSetting("multiAccount.sharedIpCap");
    const res = await banGroupWith(prisma, { adminId: admin.id, userIds: parsed.data.userIds, reason: parsed.data.reason, now: new Date(), sharedIpCap });
    if (res.accounts > 0) refreshLeaderboardsAfterBan();
    refresh();
    return { ok: true, accounts: res.accounts, bans: res.bans, skipped: res.skipped };
  } catch (e) {
    return failure("groupe", e);
  }
}

const banIdSchema = z.object({ banId: id, reason }).strict();

/** Lève un ban (et les IP qu'un appareil levé avait fait bannir). */
export async function liftNetworkBanAction(input: unknown): Promise<{ ok: true } | Failure> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  const parsed = banIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`admin-netban-lift:${admin.id}`, { limit: 30, windowSeconds: MINUTE })).success) return { ok: false, error: "RATE_LIMITED" };
  try {
    await liftNetworkBanWith(prisma, { adminId: admin.id, banId: parsed.data.banId, reason: parsed.data.reason });
    refresh();
    return { ok: true };
  } catch (e) {
    return failure("levée", e);
  }
}

/** Rend définitif un ban automatique (le ban qui suit l'appareil expire sinon). */
export async function keepNetworkBanAction(input: unknown): Promise<{ ok: true } | Failure> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  const parsed = banIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`admin-netban-keep:${admin.id}`, { limit: 30, windowSeconds: MINUTE })).success) return { ok: false, error: "RATE_LIMITED" };
  try {
    await keepNetworkBanWith(prisma, { adminId: admin.id, banId: parsed.data.banId, reason: parsed.data.reason });
    refresh();
    return { ok: true };
  } catch (e) {
    return failure("ban définitif", e);
  }
}
