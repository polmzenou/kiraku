"use server";

import { getLocale } from "next-intl/server";
import type { FudaCopy } from "@/components/fuda/Fuda";
import { isFrozen } from "@/lib/account/deletion";
import type { CardView } from "@/lib/boosters/view";
import { SEARCH_MAX_LENGTH } from "@/lib/catalog/search";
import { ONE_OF_ONE_COPY, VOUCHER_FILTERS } from "@/lib/referral/vouchers";
import { z } from "@/lib/zod";
import { cardViews } from "../boosters/display";
import { prisma } from "../db";
import { rateLimit } from "../ratelimit";
import { redeemVoucherWith, VoucherError, type VoucherErrorCode } from "../referral/voucher-core";
import { openVoucher, voucherCards, type VoucherPage } from "../referral/vouchers";
import { getCurrentUser } from "../user";

// Bons du parrainage : grille du choix et choix de la carte. Le client envoie l'id du bon et celui de la carte ; le
// serveur relit le bon (à ce joueur, pas encore utilisé), vérifie la carte et la verse sous verrou.

type Fail = { ok: false; error: "NO_SESSION" | "INVALID" | "UNAVAILABLE" | "RATE_LIMITED" | VoucherErrorCode };

const idSchema = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const cardsSchema = z
  .object({ voucherId: idSchema, q: z.string().max(SEARCH_MAX_LENGTH * 2), filter: z.enum(VOUCHER_FILTERS), offset: z.number().int().min(0).max(100_000) })
  .strict();
const redeemSchema = z.object({ voucherId: idSchema, cardId: idSchema }).strict();

type Player = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** Joueur inscrit, ni banni ni en cours de suppression. */
async function player(): Promise<{ user: Player; error?: undefined } | { error: "NO_SESSION" | "UNAVAILABLE" }> {
  const user = await getCurrentUser();
  if (!user) return { error: "NO_SESSION" };
  if (user.isGuest || user.bannedAt || isFrozen(user)) return { error: "UNAVAILABLE" };
  return { user };
}

async function limited(bucket: string, userId: string, rule: { limit: number; windowSeconds: number }, store?: "memory") {
  return !(await rateLimit(`${bucket}:${userId}`, rule, { store })).success;
}

/** Une page de la grille du bon (recherche, filtre, « Voir plus »). */
export async function voucherCardsAction(input: unknown): Promise<({ ok: true } & VoucherPage) | Fail> {
  const p = await player();
  if (p.error) return { ok: false, error: p.error };
  const parsed = cardsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const voucher = await openVoucher(p.user.id, parsed.data.voucherId);
  if (!voucher) return { ok: false, error: "USED" };
  if (await limited("voucher-cards", p.user.id, { limit: 60, windowSeconds: 60 }, "memory")) return { ok: false, error: "RATE_LIMITED" };
  try {
    return { ok: true, ...(await voucherCards({ userId: p.user.id, kind: voucher.kind, q: parsed.data.q, filter: parsed.data.filter, offset: parsed.data.offset, locale: await getLocale() })) };
  } catch (e) {
    console.error("[bons] grille", e);
    return { ok: false, error: "UNAVAILABLE" };
  }
}

export type RedeemResult = { ok: true; card: CardView & { copy?: FudaCopy | null }; isNew: boolean } | Fail;

/** Prend la carte choisie avec le bon : définitif. */
export async function redeemVoucherAction(input: unknown): Promise<RedeemResult> {
  const p = await player();
  if (p.error) return { ok: false, error: p.error };
  const parsed = redeemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await openVoucher(p.user.id, parsed.data.voucherId))) return { ok: false, error: "USED" };
  if (await limited("voucher-redeem", p.user.id, { limit: 10, windowSeconds: 60 })) return { ok: false, error: "RATE_LIMITED" };
  try {
    const done = await redeemVoucherWith(prisma, { userId: p.user.id, voucherId: parsed.data.voucherId, cardId: parsed.data.cardId, now: new Date() });
    // Pas de refresh ici : la page garde la fenêtre « Elle est à toi » ouverte, le client rafraîchit en la fermant
    const view = (await cardViews([done.cardId], await getLocale())).get(done.cardId);
    if (!view) return { ok: false, error: "UNAVAILABLE" };
    return { ok: true, card: { ...view, copy: done.edition ? ONE_OF_ONE_COPY : null }, isNew: done.isNew };
  } catch (e) {
    if (e instanceof VoucherError) return { ok: false, error: e.code === "NOT_FOUND" ? "USED" : e.code };
    console.error("[bons] choix", e);
    return { ok: false, error: "UNAVAILABLE" };
  }
}
