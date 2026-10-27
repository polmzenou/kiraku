"use server";

import { getRarities } from "@/server/catalog/rarities";
import { rarityKeySchema } from "@/lib/catalog/definitions";

import { getLocale } from "next-intl/server";
import { refresh } from "next/cache";
import { z } from "@/lib/zod";
import { ALBUM_MAX_OFFSET, parseAlbumParams, type AlbumPage } from "@/lib/collection/albums";
import { parseCollectionParams } from "@/lib/collection/params";
import { MAX_SHOWCASE_SLOTS, placeInSlot } from "@/lib/collection/showcase";
import type { CollectionPage } from "@/lib/collection/view";
import { PROFILE_VISIBILITIES } from "@/lib/collection/visibility";
import { USERNAME_REGEX } from "@/lib/username";
import { isFrozen } from "@/lib/account/deletion";
import { getAlbumPage } from "../collection/albums";
import { accessFor, findProfileOwner } from "../collection/profile";
import { getCollectionPage, MAX_OFFSET } from "../collection/queries";
import { RecycleError, recycleWith, type RecycleRequest } from "../collection/recycle-core";
import { setShowcaseWith, ShowcaseError } from "../collection/showcase-core";
import { prisma } from "../db";
import { clientIp, rateLimit } from "../ratelimit";
import { getSetting } from "../settings";
import { getCurrentUser, requireActiveUser } from "../user";

// Collection, recyclage, vitrine et confidentialité. Ordre des contrôles : session → Zod →
// propriété → rate limit. Le client n'envoie que des ids et des intentions ; les exemplaires,
// les gains et les droits de lecture sont décidés ici.

export type CollectionActionError =
  | "NO_SESSION"
  | "INVALID"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "NOTHING"
  | "STALE"
  | "NOT_OWNED"
  | "FULL"
  | "UNAVAILABLE";

type Failure = { ok: false; error: CollectionActionError };

const cardIdSchema = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);

// --- Lecture paginée ---

const albumPageSchema = z.object({
  query: z.record(z.string().max(16), z.string().max(200)).refine((q) => Object.keys(q).length <= 10),
  offset: z.number().int().min(0).max(ALBUM_MAX_OFFSET),
});

/** Albums suivants de sa propre collection (la première page est rendue par le serveur). */
export async function loadAlbumPageAction(input: unknown): Promise<({ ok: true } & AlbumPage) | Failure> {
  const viewer = await requireActiveUser();
  if (!viewer) return { ok: false, error: "NO_SESSION" };
  const parsed = albumPageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`collection:${viewer.id}`, { limit: 60, windowSeconds: 60 })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  const page = await getAlbumPage(viewer.id, parseAlbumParams(parsed.data.query), parsed.data.offset, await getLocale());
  return { ok: true, ...page };
}

const pageSchema = z.object({
  username: z.string().regex(USERNAME_REGEX).optional(),
  query: z.record(z.string().max(16), z.string().max(200)).refine((q) => Object.keys(q).length <= 10),
  offset: z.number().int().min(0).max(MAX_OFFSET),
});

/** Pages suivantes de la liste (la première est rendue par le serveur). */
export async function loadCollectionPage(input: unknown): Promise<({ ok: true } & CollectionPage) | Failure> {
  const viewer = await getCurrentUser();
  if (viewer && !(await requireActiveUser())) return { ok: false, error: "NO_SESSION" };
  const parsed = pageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };

  // Propriété : sa propre collection, ou celle d'un autre si son profil l'autorise
  let ownerId: string;
  if (parsed.data.username) {
    const owner = await findProfileOwner(parsed.data.username);
    if (!owner || !(await accessFor(viewer?.id ?? null, owner)).collection) return { ok: false, error: "FORBIDDEN" };
    ownerId = owner.id;
  } else {
    if (!viewer) return { ok: false, error: "NO_SESSION" };
    ownerId = viewer.id;
  }

  const key = viewer ? viewer.id : `ip:${await clientIp()}`;
  if (!(await rateLimit(`collection:${key}`, { limit: 60, windowSeconds: 60 })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }

  const page = await getCollectionPage(ownerId, parseCollectionParams(parsed.data.query, await getRarities()), parsed.data.offset, await getLocale(), viewer?.id);
  return { ok: true, ...page };
}

// --- Recyclage ---

export type RecycleResult = { ok: true; recycled: number; gain: number; coins: number } | Failure;

const recycleCardSchema = z.object({ cardId: cardIdSchema, count: z.number().int().min(1).max(10_000) });
const recycleAllSchema = z.object({
  maxRarity: rarityKeySchema,
  expected: z.number().int().min(1).max(100_000_000),
});

async function runRecycle(request: RecycleRequest, userId: string): Promise<RecycleResult> {
  if (!(await rateLimit(`recycle:${userId}`, { limit: 10, windowSeconds: 10 })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  try {
    const outcome = await recycleWith(prisma, userId, request, await getSetting("collection.recycleValues"));
    // En-tête (solde) et totaux de la page à jour sans recharger
    refresh();
    return { ok: true, recycled: outcome.recycled, gain: outcome.gain, coins: outcome.coins };
  } catch (e) {
    if (e instanceof RecycleError && (e.code === "NOTHING" || e.code === "STALE")) return { ok: false, error: e.code };
    if (!(e instanceof RecycleError)) console.error("[collection] recyclage impossible", e);
    return { ok: false, error: "UNAVAILABLE" };
  }
}

/** Recycle `count` doublons d'une carte (fiche carte). */
export async function recycleCardAction(input: unknown): Promise<RecycleResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const parsed = recycleCardSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  // Propriété : seuls les exemplaires du joueur de la session sont lus, dans la transaction
  if (user.bannedAt || isFrozen(user)) return { ok: false, error: "UNAVAILABLE" };
  return runRecycle({ kind: "card", cardId: parsed.data.cardId, count: parsed.data.count }, user.id);
}

/** Recycle tous les doublons jusqu'à une rareté ; `expected` est le gain que le joueur a confirmé. */
export async function recycleAllAction(input: unknown): Promise<RecycleResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const parsed = recycleAllSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (user.bannedAt || isFrozen(user)) return { ok: false, error: "UNAVAILABLE" };
  return runRecycle({ kind: "all", maxRarity: parsed.data.maxRarity, expected: parsed.data.expected }, user.id);
}

// --- Vitrine ---

export type ShowcaseResult = { ok: true; slots: (string | null)[] } | Failure;

const showcaseSchema = z.object({ slots: z.array(cardIdSchema.nullable()).max(MAX_SHOWCASE_SLOTS) });
const showcaseCardSchema = z.object({ cardId: cardIdSchema });

async function saveShowcase(userId: string, slots: (string | null)[], size: number): Promise<ShowcaseResult> {
  try {
    const saved = await setShowcaseWith(prisma, userId, slots, size);
    refresh();
    return { ok: true, slots: saved };
  } catch (e) {
    if (e instanceof ShowcaseError) return { ok: false, error: e.code === "NOT_OWNED" ? "NOT_OWNED" : e.code === "INVALID" ? "INVALID" : "UNAVAILABLE" };
    console.error("[collection] vitrine impossible", e);
    return { ok: false, error: "UNAVAILABLE" };
  }
}

async function showcaseGuard(input: unknown, schema: z.ZodType) {
  const user = await getCurrentUser();
  if (!user) return { error: "NO_SESSION" as const };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "INVALID" as const };
  if (user.bannedAt || isFrozen(user)) return { error: "UNAVAILABLE" as const };
  if (!(await rateLimit(`showcase:${user.id}`, { limit: 20, windowSeconds: 60 })).success) {
    return { error: "RATE_LIMITED" as const };
  }
  return { user, data: parsed.data, size: await getSetting("showcase.slots") };
}

async function currentShowcase(userId: string, size: number): Promise<(string | null)[]> {
  const rows = await prisma.showcaseSlot.findMany({
    where: { userId, position: { gte: 1, lte: size } },
    select: { position: true, userCard: { select: { cardId: true } } },
  });
  const slots: (string | null)[] = Array.from({ length: size }, () => null);
  for (const r of rows) slots[r.position - 1] = r.userCard.cardId;
  return slots;
}

/** Remplace toute la vitrine (ordre après un glisser-déposer, carte choisie pour une case). */
export async function setShowcaseAction(input: unknown): Promise<ShowcaseResult> {
  const guard = await showcaseGuard(input, showcaseSchema);
  if ("error" in guard) return { ok: false, error: guard.error ?? "INVALID" };
  const { slots } = guard.data as z.infer<typeof showcaseSchema>;
  return saveShowcase(guard.user.id, slots, guard.size);
}

/** Met une carte dans la première case libre (fiche carte). */
export async function addToShowcaseAction(input: unknown): Promise<ShowcaseResult> {
  const guard = await showcaseGuard(input, showcaseCardSchema);
  if ("error" in guard) return { ok: false, error: guard.error ?? "INVALID" };
  const { cardId } = guard.data as z.infer<typeof showcaseCardSchema>;
  const slots = await currentShowcase(guard.user.id, guard.size);
  if (slots.includes(cardId)) return { ok: true, slots };
  const free = slots.indexOf(null);
  if (free < 0) return { ok: false, error: "FULL" };
  return saveShowcase(guard.user.id, placeInSlot(slots, free, cardId), guard.size);
}

/** Retire une carte de la vitrine (fiche carte). */
export async function removeFromShowcaseAction(input: unknown): Promise<ShowcaseResult> {
  const guard = await showcaseGuard(input, showcaseCardSchema);
  if ("error" in guard) return { ok: false, error: guard.error ?? "INVALID" };
  const { cardId } = guard.data as z.infer<typeof showcaseCardSchema>;
  const slots = await currentShowcase(guard.user.id, guard.size);
  return saveShowcase(guard.user.id, slots.map((s) => (s === cardId ? null : s)), guard.size);
}

// --- Confidentialité ---

const privacySchema = z.object({ visibility: z.enum(PROFILE_VISIBILITIES), showCollection: z.boolean() });

export async function updatePrivacyAction(input: unknown): Promise<{ ok: true } | Failure> {
  const user = await requireActiveUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const parsed = privacySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`privacy:${user.id}`, { limit: 10, windowSeconds: 60 })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  // Champs écrits un par un, sur le compte de la session uniquement
  await prisma.user.update({
    where: { id: user.id },
    data: {
      profileVisibility: parsed.data.visibility,
      showCollection: parsed.data.showCollection,
      privacyChosenAt: new Date(),
    },
  });
  refresh();
  return { ok: true };
}
