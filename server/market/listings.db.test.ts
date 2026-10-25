import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { RARITIES } from "@/lib/catalog/rarity";
import type { ListingRules } from "@/lib/market/listings";
import { createPgAdapter } from "@/server/pg-adapter";
import { acceptOfferWith, createListingWith, declineOfferWith, ListingError, makeOfferWith } from "./listing-core";

// Concurrence des échanges ouverts du Marché sur une vraie base (base de test isolée) : sauté sans
// DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/market/listings.db.test.ts
// Les joueurs jetables sont supprimés à la fin (leurs cartes, annonces et notifications partent en cascade).

const url = process.env.DATABASE_URL_TEST;
const OLD = new Date(Date.now() - 30 * 86_400_000);
const rules: ListingRules = {
  expiryHours: 48,
  maxWants: 5,
  maxActive: 10,
  perDay: 20,
  maxPendingOffers: 20,
  allowOther: true,
  allowedRarities: [...RARITIES],
  minAccountAgeHours: 0,
};

describe.skipIf(!url)("échanges ouverts atomiques (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  const ids: string[] = [];
  let cards: string[] = [];

  async function player() {
    const user = await prisma.user.create({
      data: { username: `test-${randomBytes(4).toString("hex")}`, isGuest: false, coins: 0, createdAt: OLD },
    });
    ids.push(user.id);
    return user.id;
  }

  const give = (ownerId: string, cardId: string) => prisma.userCard.create({ data: { ownerId, cardId } });
  const owned = (ownerId: string, cardId: string) => prisma.userCard.count({ where: { ownerId, cardId } });
  const total = (ownerId: string) => prisma.userCard.count({ where: { ownerId } });

  beforeAll(async () => {
    const rows = await prisma.card.findMany({ where: { status: "PUBLISHED", rank: { not: null } }, select: { id: true }, take: 4 });
    if (rows.length < 4) throw new Error("Catalogue vide : lance d'abord npm run catalog:import");
    cards = rows.map((r) => r.id);
  }, 30_000);

  afterAll(async () => {
    if (ids.length > 0) await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }, 30_000);

  it("échange les deux exemplaires et prévient l'offrant", async () => {
    const [owner, bidder] = [await player(), await player()];
    const [listed, wanted, other] = cards;
    await give(owner, listed);
    await give(bidder, wanted);
    await give(bidder, other);

    const { listingId } = await createListingWith(prisma, { ownerId: owner, cardId: listed, wantedCardIds: [wanted], rules });
    const { offerId } = await makeOfferWith(prisma, { bidderId: bidder, listingId, cardId: other, rules }); // hors liste
    const res = await acceptOfferWith(prisma, { userId: owner, offerId, allowedRarities: rules.allowedRarities });

    expect(res).toMatchObject({ ok: true, received: { cardId: other } });
    expect(await owned(owner, other)).toBe(1);
    expect(await owned(bidder, listed)).toBe(1);
    expect(await owned(bidder, wanted)).toBe(1); // la carte non proposée reste à l'offrant
    expect(await total(owner)).toBe(1);
    expect(await total(bidder)).toBe(2);
    const notif = await prisma.notification.findFirst({ where: { userId: bidder, type: "LISTING_ACCEPTED", refId: offerId } });
    expect(notif).not.toBeNull();
    const listing = await prisma.tradeListing.findUniqueOrThrow({ where: { id: listingId }, select: { status: true } });
    expect(listing.status).toBe("TRADED");
  }, 60_000);

  it("garde le commentaire de l'annonce et le motif d'un refus", async () => {
    const [owner, bidder] = [await player(), await player()];
    const [listed, wanted] = cards;
    await give(owner, listed);
    await give(bidder, wanted);
    const { listingId } = await createListingWith(prisma, { ownerId: owner, cardId: listed, wantedCardIds: [wanted], note: "La première de préférence", rules });
    const { offerId } = await makeOfferWith(prisma, { bidderId: bidder, listingId, cardId: wanted, rules });
    await declineOfferWith(prisma, { userId: owner, offerId, note: "Déjà en double" });

    expect((await prisma.tradeListing.findUniqueOrThrow({ where: { id: listingId }, select: { note: true } })).note).toBe("La première de préférence");
    const offer = await prisma.listingOffer.findUniqueOrThrow({ where: { id: offerId }, select: { status: true, declineNote: true } });
    expect(offer).toEqual({ status: "DECLINED", declineNote: "Déjà en double" });
  });

  it("refuse une annonce qui demande une carte déjà possédée, et une offre sur sa propre annonce", async () => {
    const owner = await player();
    const [listed, wanted] = cards;
    await give(owner, listed);
    await give(owner, wanted);
    await expect(createListingWith(prisma, { ownerId: owner, cardId: listed, wantedCardIds: [wanted], rules })).rejects.toMatchObject({
      code: "ALREADY_OWNED",
    });

    const { listingId } = await createListingWith(prisma, { ownerId: owner, cardId: listed, wantedCardIds: [cards[2]], rules });
    await expect(makeOfferWith(prisma, { bidderId: owner, listingId, cardId: wanted, rules })).rejects.toBeInstanceOf(ListingError);
  }, 60_000);

  it("deux offres acceptées en même temps : un seul échange, aucune carte dupliquée", async () => {
    const [owner, b1, b2] = [await player(), await player(), await player()];
    const [listed, w1, w2] = cards;
    await give(owner, listed);
    await give(b1, w1);
    await give(b2, w2);
    const { listingId } = await createListingWith(prisma, { ownerId: owner, cardId: listed, wantedCardIds: [w1, w2], rules });
    const o1 = await makeOfferWith(prisma, { bidderId: b1, listingId, cardId: w1, rules });
    const o2 = await makeOfferWith(prisma, { bidderId: b2, listingId, cardId: w2, rules });

    const results = await Promise.allSettled([
      acceptOfferWith(prisma, { userId: owner, offerId: o1.offerId, allowedRarities: rules.allowedRarities }),
      acceptOfferWith(prisma, { userId: owner, offerId: o2.offerId, allowedRarities: rules.allowedRarities }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled" && r.value.ok)).toHaveLength(1);
    // L'unique exemplaire de la carte de l'annonce n'existe qu'une fois
    expect((await owned(owner, listed)) + (await owned(b1, listed)) + (await owned(b2, listed))).toBe(1);
    // Chacun garde le même nombre de cartes
    expect([await total(owner), await total(b1), await total(b2)]).toEqual([1, 1, 1]);
    // L'offre perdante est fermée et son auteur prévenu
    const offers = await prisma.listingOffer.findMany({ where: { listingId }, select: { status: true } });
    expect(offers.map((o) => o.status).sort()).toEqual(["ACCEPTED", "CLOSED"]);
  }, 60_000);

  it("carte de l'offrant partie entre-temps : l'offre échoue, l'annonce reste ouverte", async () => {
    const [owner, bidder] = [await player(), await player()];
    const [listed, wanted] = cards;
    await give(owner, listed);
    const copy = await give(bidder, wanted);
    const { listingId } = await createListingWith(prisma, { ownerId: owner, cardId: listed, wantedCardIds: [wanted], rules });
    const { offerId } = await makeOfferWith(prisma, { bidderId: bidder, listingId, cardId: wanted, rules });
    await prisma.userCard.delete({ where: { id: copy.id } }); // recyclée

    const res = await acceptOfferWith(prisma, { userId: owner, offerId, allowedRarities: rules.allowedRarities });
    expect(res).toEqual({ ok: false, code: "OFFER_GONE" });
    expect(await owned(owner, listed)).toBe(1);
    const [offer, listing] = await Promise.all([
      prisma.listingOffer.findUniqueOrThrow({ where: { id: offerId }, select: { status: true } }),
      prisma.tradeListing.findUniqueOrThrow({ where: { id: listingId }, select: { status: true } }),
    ]);
    expect(offer.status).toBe("FAILED");
    expect(listing.status).toBe("OPEN");
  }, 60_000);
});
