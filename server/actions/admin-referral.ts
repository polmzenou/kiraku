"use server";

import { refresh, updateTag } from "next/cache";
import { getLocale } from "next-intl/server";
import { canManageReferrals } from "@/lib/admin/roles";
import { localize, parseLocalized } from "@/lib/boosters/types";
import { z } from "@/lib/zod";
import { getStaff } from "../admin";
import { prisma } from "../db";
import { rateLimit } from "../ratelimit";
import { progressDeps, referralV2Rules } from "../referral/deps";
import { applyHold } from "../referral/holds";
import { AmbassadorDecisionError, decideAmbassadorWith, type AmbassadorDecisionErrorCode } from "../referral/ambassador-core";
import { setVanityCodeWith, VanityError, vanityStatusWith, type VanityErrorCode } from "../referral/vanity-core";
import { pushLater } from "../market/queries";
import { previewRevokeWith, ReviewError, revokeReferralWith, validateReferralWith, type ReviewErrorCode } from "../referral/review-core";
import { getSetting } from "../settings";
import { checkEnnichiWith, drawEnnichiWith, EnnichiCloseError, payAwardsWith, type EnnichiCloseErrorCode } from "../ennichi/close-core";
import { ennichiPayDeps, ennichiState } from "../ennichi/deps";
import { ENNICHI_TAG } from "../ennichi/queries";

// Parrainage v2 : toute l'équipe (ADMIN et DEV) traite la file « À vérifier », exception explicite au « seul l'admin
// écrit » (lib/admin/roles.ts, canManageReferrals, vérifiée par lib/admin/dev-access.test.ts). Ordre : équipe → Zod →
// rate limit, puis tout est relu sous verrou (server/referral/review-core.ts), qui écrit chaque décision dans le
// journal admin.

export type ReferralStaffError = "FORBIDDEN" | "INVALID" | "RATE_LIMITED" | "UNAVAILABLE" | ReviewErrorCode;
export type AmbassadorStaffError = "FORBIDDEN" | "INVALID" | "RATE_LIMITED" | "UNAVAILABLE" | AmbassadorDecisionErrorCode;
export type VanityStaffError = "FORBIDDEN" | "INVALID" | "RATE_LIMITED" | "UNAVAILABLE" | VanityErrorCode;
type Fail = { ok: false; error: ReferralStaffError };

const id = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const reviewSchema = z
  .object({ referralId: id, decision: z.enum(["VALIDATE", "REVOKE", "BAN"]), reason: z.string().trim().max(300).nullable() })
  .strict()
  .refine((v) => v.decision === "VALIDATE" || (v.reason !== null && v.reason.length > 0), { message: "Motif obligatoire" });
const referralSchema = z.object({ referralId: id }).strict();
const proposalSchema = z.object({ proposalId: id, accept: z.boolean() }).strict();
const username = z.string().trim().min(1).max(40);
const vanitySetSchema = z.object({ username, code: z.string().trim().min(1).max(40) }).strict();
const vanityClearSchema = z.object({ userId: id }).strict();
const vanityStatusSchema = z.object({ username: z.string().trim().max(40), code: z.string().trim().max(40) }).strict();

/** Joueur inscrit désigné par son pseudo (sans tenir compte des majuscules). */
const playerByName = (name: string) =>
  prisma.user.findFirst({ where: { username: { equals: name, mode: "insensitive" }, isGuest: false }, select: { id: true } });

/** Membre de l'équipe autorisé sur le parrainage, ou null. */
async function staff() {
  const s = await getStaff();
  return s && canManageReferrals(s.user.role) ? s.user : null;
}

const limited = async (userId: string, bucket: string, limit: number) => !(await rateLimit(`referral-${bucket}:${userId}`, { limit, windowSeconds: 60 })).success;

function failure(scope: string, e: unknown): Fail {
  if (e instanceof ReviewError) return { ok: false, error: e.code };
  console.error(`[parrainage admin] ${scope}`, e);
  return { ok: false, error: "UNAVAILABLE" };
}

/**
 * Décision sur un parrainage : valider (tout ce qui était dû est versé), révoquer (plus rien n'est versé, rien n'est
 * repris), ou révoquer et bannir (tout est repris, les deux comptes sont bannis). Un motif est exigé pour révoquer.
 */
export async function reviewReferralAction(input: unknown): Promise<{ ok: true; paid: number; banned: number } | Fail> {
  const user = await staff();
  if (!user) return { ok: false, error: "FORBIDDEN" };
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (await limited(user.id, "review", 20)) return { ok: false, error: "RATE_LIMITED" };
  const { referralId, decision, reason } = parsed.data;
  const now = new Date();
  try {
    if (decision === "VALIDATE") {
      const { paid } = await validateReferralWith(prisma, { staffId: user.id, referralId, note: reason, now }, await progressDeps(now));
      refresh();
      return { ok: true, paid, banned: 0 };
    }
    const { banned } = await revokeReferralWith(prisma, {
      staffId: user.id,
      referralId,
      ban: decision === "BAN",
      reason: reason ?? "",
      now,
      sharedIpCap: await getSetting("multiAccount.sharedIpCap"),
    });
    refresh();
    return { ok: true, paid: 0, banned: banned.length };
  } catch (e) {
    return failure("décision", e);
  }
}

/** Ambassadeur proposé par le parrainage : accepter pose le rôle (le joueur est prévenu), refuser ferme la proposition. */
export async function decideAmbassadorAction(input: unknown): Promise<{ ok: true } | { ok: false; error: AmbassadorStaffError }> {
  const user = await staff();
  if (!user) return { ok: false, error: "FORBIDDEN" };
  const parsed = proposalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (await limited(user.id, "ambassador", 20)) return { ok: false, error: "RATE_LIMITED" };
  try {
    await decideAmbassadorWith(prisma, { staffId: user.id, proposalId: parsed.data.proposalId, accept: parsed.data.accept, now: new Date() }, pushLater);
    refresh();
    return { ok: true };
  } catch (e) {
    if (e instanceof AmbassadorDecisionError) return { ok: false, error: e.code };
    console.error("[parrainage admin] ambassadeur", e);
    return { ok: false, error: "UNAVAILABLE" };
  }
}

function vanityFailure(e: unknown): { ok: false; error: VanityStaffError } {
  if (e instanceof VanityError) return { ok: false, error: e.code };
  console.error("[parrainage admin] code perso", e);
  return { ok: false, error: "UNAVAILABLE" };
}

/** Pose le code perso d'un joueur (désigné par son pseudo) ; son code standard marche toujours. */
export async function setVanityCodeAction(input: unknown): Promise<{ ok: true; code: string } | { ok: false; error: VanityStaffError }> {
  const user = await staff();
  if (!user) return { ok: false, error: "FORBIDDEN" };
  const parsed = vanitySetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (await limited(user.id, "vanity", 20)) return { ok: false, error: "RATE_LIMITED" };
  try {
    const player = await playerByName(parsed.data.username);
    if (!player) return { ok: false, error: "NOT_FOUND" };
    const { code } = await setVanityCodeWith(prisma, { staffId: user.id, userId: player.id, code: parsed.data.code });
    refresh();
    return { ok: true, code: code ?? "" };
  } catch (e) {
    return vanityFailure(e);
  }
}

/** Retire le code perso d'un joueur : son code standard reste. */
export async function clearVanityCodeAction(input: unknown): Promise<{ ok: true } | { ok: false; error: VanityStaffError }> {
  const user = await staff();
  if (!user) return { ok: false, error: "FORBIDDEN" };
  const parsed = vanityClearSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (await limited(user.id, "vanity", 20)) return { ok: false, error: "RATE_LIMITED" };
  try {
    await setVanityCodeWith(prisma, { staffId: user.id, userId: parsed.data.userId, code: null });
    refresh();
    return { ok: true };
  } catch (e) {
    return vanityFailure(e);
  }
}

/** Indication du formulaire pendant la saisie : code libre, déjà pris, ou refusé par sa forme. */
export async function vanityStatusAction(input: unknown): Promise<{ ok: true; status: "FREE" | "TAKEN" | "FORMAT" | "STANDARD_SHAPE" } | { ok: false; error: VanityStaffError }> {
  const user = await staff();
  if (!user) return { ok: false, error: "FORBIDDEN" };
  const parsed = vanityStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (await limited(user.id, "vanity-status", 120)) return { ok: false, error: "RATE_LIMITED" };
  try {
    const player = parsed.data.username ? await playerByName(parsed.data.username) : null;
    return { ok: true, status: await vanityStatusWith(prisma, parsed.data.code, player?.id ?? null) };
  } catch (e) {
    return vanityFailure(e);
  }
}

/** Recalcule le score de la paire ; au-dessus du seuil, le parrainage passe « À vérifier » s'il n'est pas tranché. */
export async function rescoreReferralAction(input: unknown): Promise<{ ok: true; held: boolean } | Fail> {
  const user = await staff();
  if (!user) return { ok: false, error: "FORBIDDEN" };
  const parsed = referralSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (await limited(user.id, "rescore", 30)) return { ok: false, error: "RATE_LIMITED" };
  try {
    const referral = await prisma.referral.findUnique({ where: { id: parsed.data.referralId }, select: { id: true, version: true, referrerId: true, refereeId: true } });
    if (!referral || referral.version !== 2) return { ok: false, error: "NOT_FOUND" };
    const [rules, sharedCap] = await Promise.all([referralV2Rules(), getSetting("multiAccount.sharedIpCap")]);
    const held = await prisma.$transaction((tx) => applyHold(tx, referral, rules, { withScore: true, sharedCap, now: new Date() }));
    refresh();
    return { ok: true, held: held !== null };
  } catch (e) {
    return failure("score", e);
  }
}

export type RevokePreviewLine = {
  user: string;
  what: "ZENI" | "BOOSTERS" | "SEALED" | "CARDS" | "VOUCHERS";
  /** Nom du booster (BOOSTERS). */
  name: string | null;
  given: number;
  taken: number;
};

/**
 * Aperçu de « Révoquer et bannir », pour la confirmation : ce que chaque joueur a reçu du parrainage, ce qui serait
 * repris, et les paliers du parrain qui tomberaient. Rien n'est écrit ; la reprise relit tout sous verrou.
 */
export async function revokePreviewAction(input: unknown): Promise<{ ok: true; lines: RevokePreviewLine[]; milestones: number[]; referrer: string } | Fail> {
  const user = await staff();
  if (!user) return { ok: false, error: "FORBIDDEN" };
  const parsed = referralSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (await limited(user.id, "preview", 60)) return { ok: false, error: "RATE_LIMITED" };
  try {
    const preview = await previewRevokeWith(prisma, parsed.data.referralId);
    if (!preview) return { ok: false, error: "NOT_FOUND" };
    const typeIds = [...new Set(preview.reports.flatMap((r) => Object.keys(r.granted.credits)))];
    const [locale, players, types] = await Promise.all([
      getLocale(),
      prisma.user.findMany({ where: { id: { in: [preview.referrerId, ...preview.reports.map((r) => r.userId)] } }, select: { id: true, username: true } }),
      prisma.boosterType.findMany({ where: { id: { in: typeIds } }, select: { id: true, name: true } }),
    ]);
    const nameOf = new Map(players.map((p) => [p.id, p.username]));
    const typeName = new Map(types.map((b) => [b.id, localize(parseLocalized(b.name), locale)]));
    const lines: RevokePreviewLine[] = [];
    for (const r of preview.reports) {
      const who = nameOf.get(r.userId) ?? r.userId;
      const { granted, taken } = r;
      if (granted.zeni > 0) lines.push({ user: who, what: "ZENI", name: null, given: granted.zeni, taken: taken.zeni });
      for (const [type, n] of Object.entries(granted.credits)) {
        if (n > 0) lines.push({ user: who, what: "BOOSTERS", name: typeName.get(type) ?? type, given: n, taken: taken.credits[type] ?? 0 });
      }
      if (granted.sealedIds.length) lines.push({ user: who, what: "SEALED", name: null, given: granted.sealedIds.length, taken: taken.sealedIds.length });
      if (granted.cardIds.length) lines.push({ user: who, what: "CARDS", name: null, given: granted.cardIds.length, taken: taken.cardIds.length });
      if (granted.voucherIds.length) lines.push({ user: who, what: "VOUCHERS", name: null, given: granted.voucherIds.length, taken: taken.voucherIds.length });
    }
    return { ok: true, lines, milestones: preview.milestones, referrer: nameOf.get(preview.referrerId) ?? "" };
  } catch (e) {
    return failure("aperçu", e);
  }
}

/* ---------------- Clôture de l'Ennichi ---------------- */

export type EnnichiStaffError = "FORBIDDEN" | "INVALID" | "RATE_LIMITED" | "UNAVAILABLE" | "STALE" | EnnichiCloseErrorCode;
type EnnichiFail = { ok: false; error: EnnichiStaffError };

// L'édition affichée par la page : une page restée ouverte sur l'édition précédente n'agit pas sur la nouvelle
const ennichiSchema = z.object({ edition: z.number().int().min(1).max(1_000) }).strict();

function ennichiFailure(scope: string, e: unknown): EnnichiFail {
  if (e instanceof EnnichiCloseError) return { ok: false, error: e.code };
  console.error(`[ennichi admin] ${scope}`, e);
  return { ok: false, error: "UNAVAILABLE" };
}

/**
 * « Contrôler » (jours de clôture) : le score de chaque parrainage de la fête est recalculé ; ceux qui dépassent le
 * seuil passent « À vérifier ». Relançable ; écrit dans le journal admin (checkEnnichiWith).
 */
export async function checkEnnichiAction(input: unknown): Promise<{ ok: true; checked: number; held: number } | EnnichiFail> {
  const user = await staff();
  if (!user) return { ok: false, error: "FORBIDDEN" };
  const parsed = ennichiSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (await limited(user.id, "ennichi", 6)) return { ok: false, error: "RATE_LIMITED" };
  try {
    const now = new Date();
    const state = await ennichiState(now);
    if (state.rules.edition !== parsed.data.edition) return { ok: false, error: "STALE" };
    if (state.phase !== "closing") return { ok: false, error: state.phase === "closed" ? "ALREADY_DRAWN" : "NOT_CLOSING" };
    const [rules, sharedCap] = await Promise.all([referralV2Rules(), getSetting("multiAccount.sharedIpCap")]);
    const out = await checkEnnichiWith(prisma, { staffId: user.id, edition: state.rules.edition, now, rules, sharedCap });
    refresh();
    return { ok: true, ...out };
  } catch (e) {
    return ennichiFailure("contrôle", e);
  }
}

/**
 * « Arrêter et tirer » : banzuke, tickets et cagnotte figés, omikuji tiré (une seule fois : un second appel trouve le
 * tirage fait), puis les prix versés pendant au plus 20 secondes ; le cron de l'Ennichi verse ce qui reste.
 */
export async function drawEnnichiAction(
  input: unknown,
): Promise<{ ok: true; ranked: number; tickets: number; draws: number; paid: number; left: number } | EnnichiFail> {
  const user = await staff();
  if (!user) return { ok: false, error: "FORBIDDEN" };
  const parsed = ennichiSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (await limited(user.id, "ennichi", 6)) return { ok: false, error: "RATE_LIMITED" };
  try {
    const now = new Date();
    const state = await ennichiState(now);
    if (state.rules.edition !== parsed.data.edition) return { ok: false, error: "STALE" };
    const out = await drawEnnichiWith(prisma, { staffId: user.id, rules: state.rules, now });
    // Les pages de la fête passent tout de suite aux résultats
    updateTag(ENNICHI_TAG);
    const { paid } = await payAwardsWith(prisma, state.rules.edition, { ...ennichiPayDeps(now), deadline: Date.now() + 20_000 });
    refresh();
    return { ok: true, ranked: out.ranked, tickets: out.tickets, draws: out.draws, paid, left: Math.max(0, out.awards - paid) };
  } catch (e) {
    return ennichiFailure("tirage", e);
  }
}
