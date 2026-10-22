"use server";

import { getLocale } from "next-intl/server";
import { refresh } from "next/cache";
import { after } from "next/server";
import { isFrozen } from "@/lib/account/deletion";
import type { OpenedCardView } from "@/lib/boosters/view";
import { SEARCH_MAX_LENGTH } from "@/lib/catalog/search";
import { LISTING_FILTERS, type ListingRules } from "@/lib/market/listings";
import { noteSchema } from "@/lib/text/plain";
import { z } from "@/lib/zod";
import { cardViews } from "../boosters/display";
import { prisma } from "../db";
import {
  acceptOfferWith,
  cancelListingWith,
  createListingWith,
  declineOfferWith,
  ListingError,
  makeOfferWith,
  markListingRevealsSeenWith,
  withdrawOfferWith,
  type ListingErrorCode,
} from "../market/listing-core";
import { listListings, searchWantableCards, type ListingPage } from "../market/listings";
import { pushNotifications } from "../push/send";
import { rateLimit } from "../ratelimit";
import { getSetting } from "../settings";
import { getCurrentUser } from "../user";

// Échanges ouverts du Marché. Ordre des contrôles : session → Zod → compte inscrit non banni ni gelé
// → interrupteurs → rate limit → propriété et règles relues sous verrou (server/market/listing-core.ts).
// Le client n'envoie que des ids de cartes, d'annonces et d'offres ; les exemplaires sont choisis ici.

export type ListingActionError = ListingErrorCode | "NO_SESSION" | "INVALID" | "DISABLED" | "RATE_LIMITED" | "UNAVAILABLE";
type Failure = { ok: false; error: ListingActionError };

const id = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const createSchema = z.object({ cardId: id, wantedCardIds: z.array(id).min(1).max(10), note: noteSchema }).strict();
const listingIdSchema = z.object({ listingId: id }).strict();
const offerSchema = z.object({ listingId: id, cardId: id }).strict();
const offerIdSchema = z.object({ offerId: id }).strict();
const declineSchema = z.object({ offerId: id, note: noteSchema }).strict();
const seenSchema = z.object({ offerIds: z.array(id).min(1).max(50) }).strict();
const pageSchema = z
  .object({ q: z.string().max(SEARCH_MAX_LENGTH), filter: z.enum(LISTING_FILTERS), cursor: id.nullable() })
  .strict();
const wantableSchema = z.object({ q: z.string().max(SEARCH_MAX_LENGTH), offset: z.number().int().min(0).max(100_000) }).strict();

const pushLater = (ids: string[]) => after(() => pushNotifications(ids));

async function listingRules(): Promise<ListingRules> {
  const [expiryHours, maxWants, maxActive, perDay, maxPendingOffers, allowOther, allowedRarities, minAccountAgeHours] = await Promise.all([
    getSetting("listings.expiryHours"),
    getSetting("listings.maxWants"),
    getSetting("listings.maxActive"),
    getSetting("listings.perDay"),
    getSetting("listings.maxPendingOffers"),
    getSetting("listings.allowOther"),
    getSetting("listings.allowedRarities"),
    getSetting("market.minAccountAgeHours"),
  ]);
  return { expiryHours, maxWants, maxActive, perDay, maxPendingOffers, allowOther, allowedRarities, minAccountAgeHours };
}

async function enabled() {
  const [market, listings] = await Promise.all([getSetting("market.enabled"), getSetting("listings.enabled")]);
  return market && listings;
}

/** Session, schéma, compte inscrit non banni, interrupteurs, rate limit. */
async function guard<S extends z.ZodType>(input: unknown, schema: S, bucket: string, rule: { limit: number; windowSeconds: number }) {
  const user = await getCurrentUser();
  if (!user) return { error: "NO_SESSION" as const };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "INVALID" as const };
  if (user.isGuest) return { error: "GUEST" as const };
  if (user.bannedAt || isFrozen(user)) return { error: "UNAVAILABLE" as const };
  if (!(await enabled())) return { error: "DISABLED" as const };
  if (!(await rateLimit(`${bucket}:${user.id}`, rule)).success) return { error: "RATE_LIMITED" as const };
  return { user, data: parsed.data as z.infer<S> };
}

function failure(e: unknown): Failure {
  if (e instanceof ListingError) return { ok: false, error: e.code };
  console.error("[echanges-marche] action impossible", e);
  return { ok: false, error: "UNAVAILABLE" };
}

/** Publie une annonce : `cardId` (une de ses cartes) contre l'une des `wantedCardIds`. */
export async function createListingAction(input: unknown): Promise<{ ok: true } | Failure> {
  const g = await guard(input, createSchema, "listing-create", { limit: 10, windowSeconds: 60 });
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  try {
    await createListingWith(prisma, {
      ownerId: g.user.id,
      cardId: g.data.cardId,
      wantedCardIds: g.data.wantedCardIds,
      note: g.data.note,
      rules: await listingRules(),
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

export async function cancelListingAction(input: unknown): Promise<{ ok: true } | Failure> {
  const g = await guard(input, listingIdSchema, "listing-respond", { limit: 30, windowSeconds: 60 });
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  try {
    await cancelListingWith(prisma, { userId: g.user.id, listingId: g.data.listingId }, pushLater);
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

/** Propose une de ses cartes sur une annonce ; l'auteur est notifié. */
export async function makeOfferAction(input: unknown): Promise<{ ok: true } | Failure> {
  const g = await guard(input, offerSchema, "listing-offer", { limit: 20, windowSeconds: 60 });
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  try {
    await makeOfferWith(prisma, { bidderId: g.user.id, listingId: g.data.listingId, cardId: g.data.cardId, rules: await listingRules() }, pushLater);
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

export async function withdrawOfferAction(input: unknown): Promise<{ ok: true } | Failure> {
  const g = await guard(input, offerIdSchema, "listing-respond", { limit: 30, windowSeconds: 60 });
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  try {
    await withdrawOfferWith(prisma, { userId: g.user.id, offerId: g.data.offerId });
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

/** L'auteur accepte une offre ; renvoie la carte reçue à révéler. */
export async function acceptOfferAction(input: unknown): Promise<{ ok: true; card: OpenedCardView } | Failure> {
  const g = await guard(input, offerIdSchema, "listing-respond", { limit: 30, windowSeconds: 60 });
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  try {
    const res = await acceptOfferWith(
      prisma,
      { userId: g.user.id, offerId: g.data.offerId, allowedRarities: await getSetting("listings.allowedRarities") },
      pushLater,
    );
    refresh();
    if (!res.ok) return { ok: false, error: res.code };
    const view = (await cardViews([res.received.cardId], await getLocale())).get(res.received.cardId);
    if (!view) return { ok: false, error: "UNAVAILABLE" };
    return { ok: true, card: { ...view, userCardId: res.received.userCardId, isNew: res.received.isNew, wished: res.received.wished, featured: false } };
  } catch (e) {
    return failure(e);
  }
}

export async function declineOfferAction(input: unknown): Promise<{ ok: true } | Failure> {
  const g = await guard(input, declineSchema, "listing-respond", { limit: 30, windowSeconds: 60 });
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  try {
    await declineOfferWith(prisma, { userId: g.user.id, offerId: g.data.offerId, note: g.data.note }, pushLater);
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

/** L'offrant a vu la révélation de ses cartes reçues : elle ne se rejoue plus. */
export async function markListingRevealsSeenAction(input: unknown): Promise<{ ok: true } | Failure> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const parsed = seenSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`listing-seen:${user.id}`, { limit: 20, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };
  await markListingRevealsSeenWith(prisma, { userId: user.id, offerIds: parsed.data.offerIds });
  return { ok: true };
}

/** Page suivante des annonces (« Voir plus », recherche, filtres). Les invités peuvent consulter. */
export async function loadListingsPageAction(input: unknown): Promise<({ ok: true } & ListingPage) | Failure> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const parsed = pageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await enabled())) return { ok: false, error: "DISABLED" };
  if (!(await rateLimit(`listing-page:${user.id}`, { limit: 60, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };
  try {
    const page = await listListings({ viewerId: user.id, ...parsed.data, locale: await getLocale() });
    return { ok: true, ...page };
  } catch (e) {
    return failure(e);
  }
}

/** Cartes du catalogue que le joueur n'a pas (choix des cartes demandées). */
export async function searchWantableCardsAction(input: unknown) {
  const g = await guard(input, wantableSchema, "listing-wantable", { limit: 60, windowSeconds: 60 });
  if ("error" in g) return { ok: false as const, error: g.error ?? "INVALID" };
  try {
    return { ok: true as const, ...(await searchWantableCards({ userId: g.user.id, q: g.data.q, offset: g.data.offset, locale: await getLocale() })) };
  } catch (e) {
    return failure(e);
  }
}
