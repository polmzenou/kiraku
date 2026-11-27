"use server";

import { getRarities } from "@/server/catalog/rarities";
import { rarityKeySchema } from "@/lib/catalog/definitions";

import { getLocale } from "next-intl/server";
import { refresh, updateTag } from "next/cache";
import { z } from "@/lib/zod";
import { ALBUM_MAX_OFFSET, parseAlbumParams, type AlbumPage } from "@/lib/collection/albums";
import { parseCollectionParams } from "@/lib/collection/params";
import type { CollectionPage } from "@/lib/collection/view";
import { PROFILE_VISIBILITIES } from "@/lib/collection/visibility";
import { USERNAME_REGEX } from "@/lib/username";
import { isFrozen } from "@/lib/account/deletion";
import type { FudaCopy } from "@/components/fuda/Fuda";
import { isSpecialCopy } from "@/lib/collection/copies";
import { fudaCopyOf } from "@/lib/prestige/printing";
import { getAlbumPage } from "../collection/albums";
import { getTopCollectors, LEADERBOARD_TAG } from "../collection/leaderboard";
import { accessFor, findProfileOwner } from "../collection/profile";
import { getCollectionPage, getOwnedCopies, MAX_OFFSET } from "../collection/queries";
import { RecycleError, recycleWith, type RecycleRequest } from "../collection/recycle-core";
import { EVENT_ACHIEVEMENTS, unlockAchievementWith } from "../achievements/unlock";
import { prisma } from "../db";
import { clientNetworkKey, rateLimit } from "../ratelimit";
import { getSetting } from "../settings";
import { getPrintingSeals } from "../prestige/rules";
import { getCurrentUser, requireActiveUser } from "../user";

// Collection, recyclage et confidentialité (les vitrines : server/actions/showcases.ts). Ordre des contrôles : session → Zod →
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
}).strict();

/** Albums suivants de sa propre collection (la première page est rendue par le serveur). */
export async function loadAlbumPageAction(input: unknown): Promise<({ ok: true } & AlbumPage) | Failure> {
  const viewer = await requireActiveUser();
  if (!viewer) return { ok: false, error: "NO_SESSION" };
  const parsed = albumPageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`collection:${viewer.id}`, { limit: 60, windowSeconds: 60 }, { store: "memory" })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  const page = await getAlbumPage(viewer.id, parseAlbumParams(parsed.data.query), parsed.data.offset, await getLocale());
  return { ok: true, ...page };
}

const pageSchema = z.object({
  username: z.string().regex(USERNAME_REGEX).optional(),
  query: z.record(z.string().max(16), z.string().max(200)).refine((q) => Object.keys(q).length <= 10),
  offset: z.number().int().min(0).max(MAX_OFFSET),
}).strict();

/** Pages suivantes de la liste (la première est rendue par le serveur). */
export async function loadCollectionPage(input: unknown): Promise<({ ok: true } & CollectionPage) | Failure> {
  const viewer = await getCurrentUser();
  if (viewer && !(await requireActiveUser())) return { ok: false, error: "NO_SESSION" };
  const parsed = pageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };

  // Propriété : sa propre collection, ou celle d'un autre si son profil l'autorise (ou si le visiteur est admin)
  let ownerId: string;
  if (parsed.data.username) {
    const owner = await findProfileOwner(parsed.data.username);
    if (!owner || !(await accessFor(viewer, owner)).collection) return { ok: false, error: "FORBIDDEN" };
    ownerId = owner.id;
  } else {
    if (!viewer) return { ok: false, error: "NO_SESSION" };
    ownerId = viewer.id;
  }

  // Visiteur sans session : par IP, une IPv6 par son /64
  const key = viewer ? viewer.id : `ip:${await clientNetworkKey()}`;
  if (!(await rateLimit(`collection:${key}`, { limit: 60, windowSeconds: 60 }, { store: "memory" })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }

  const page = await getCollectionPage(ownerId, parseCollectionParams(parsed.data.query, await getRarities()), parsed.data.offset, await getLocale(), viewer?.id);
  return { ok: true, ...page };
}

// --- Exemplaires d'une carte (prestige) ---

export type CardCopies = {
  /** Exemplaires ordinaires en collection : le serveur en choisit un quand le joueur n'en désigne pas. */
  ordinary: number;
  /** Exemplaires spéciaux en collection (héritiers ou gravés) : ils ne partent que désignés. */
  special: ({ userCardId: string } & FudaCopy)[];
};

const copiesSchema = z.object({ cardId: cardIdSchema }).strict();

/** Exemplaires en collection d'une carte du joueur : de quoi choisir celui qui part (CopyPicker). */
export async function copiesOfCardAction(input: unknown): Promise<{ ok: true; copies: CardCopies } | Failure> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const parsed = copiesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`copies:${user.id}`, { limit: 60, windowSeconds: 60 }, { store: "memory" })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  // Propriété : seuls les exemplaires du joueur de la session sont lus ; les plus hauts héritages d'abord
  const [owned, seals] = await Promise.all([getOwnedCopies(user.id, parsed.data.cardId), getPrintingSeals()]);
  const inCollection = owned.filter((c) => c.status === "COLLECTION");
  const special = inCollection.filter(isSpecialCopy).sort((a, b) => b.heritage - a.heritage);
  return {
    ok: true,
    copies: {
      ordinary: inCollection.length - special.length,
      special: special.flatMap((c) => {
        const copy = fudaCopyOf(c, seals);
        return copy ? [{ userCardId: c.id, ...copy }] : [];
      }),
    },
  };
}

// --- Recyclage ---

export type RecycleResult = { ok: true; recycled: number; gain: number; coins: number } | Failure;

const recycleCardSchema = z.object({ cardId: cardIdSchema, count: z.number().int().min(1).max(10_000) }).strict();
const recycleCopySchema = z.object({ userCardId: cardIdSchema, expected: z.number().int().min(0).max(100_000_000) }).strict();
const recycleAllSchema = z.object({
  maxRarity: rarityKeySchema,
  expected: z.number().int().min(1).max(100_000_000),
}).strict();

async function runRecycle(request: RecycleRequest, userId: string): Promise<RecycleResult> {
  if (!(await rateLimit(`recycle:${userId}`, { limit: 10, windowSeconds: 10 })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  try {
    const [values, engravedMultiplier] = await Promise.all([getSetting("collection.recycleValues"), getSetting("prestige.printing.recycleMultiplier")]);
    const outcome = await recycleWith(prisma, userId, request, values, engravedMultiplier);
    // Succès secret « Sacrilège » : après coup, hors de la transaction des Zeni (un échec ici ne coûte rien au joueur)
    if ((outcome.byRarity.MYTHIC?.copies ?? 0) > 0) {
      await unlockAchievementWith(prisma, userId, EVENT_ACHIEVEMENTS.mythicRecycled).catch((e: unknown) => console.error("[achievements] sacrilège", e));
    }
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

/** Recycle un exemplaire spécial (héritier ou gravé), désigné depuis sa ligne ; `expected` est le gain confirmé. */
export async function recycleCopyAction(input: unknown): Promise<RecycleResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const parsed = recycleCopySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  // Propriété : l'exemplaire est relu sous le verrou du joueur de la session, dans la transaction
  if (user.bannedAt || isFrozen(user)) return { ok: false, error: "UNAVAILABLE" };
  return runRecycle({ kind: "copy", userCardId: parsed.data.userCardId, expected: parsed.data.expected }, user.id);
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

// --- Confidentialité ---

const privacySchema = z.object({ visibility: z.enum(PROFILE_VISIBILITIES), showCollection: z.boolean() }).strict();

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
  // Un profil qui n'est plus public quitte le classement tout de suite, au lieu d'y rester (pseudo, avatar) le temps
  // du cache (cinq minutes) ; seulement s'il y figure : rien à retirer sinon, et pas de recalcul offert à chaque clic
  if (parsed.data.visibility !== "PUBLIC" && (await getTopCollectors()).some((c) => c.username === user.username)) {
    updateTag(LEADERBOARD_TAG);
  }
  refresh();
  return { ok: true };
}
