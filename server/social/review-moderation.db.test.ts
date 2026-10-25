import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { createPgAdapter } from "@/server/pg-adapter";
import { ReviewModerationError, setReviewHiddenWith, setReviewPinnedWith, setReviewReplyWith } from "./review-moderation-core";

// Modération des avis sur une vraie base (base de test isolée) : sauté sans DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/social/review-moderation.db.test.ts
// Crée un admin et des joueurs jetables, puis supprime uniquement ce qu'ils ont créé. Les tests
// d'épinglage supposent qu'aucun autre avis n'est épinglé sur la branche de test.

const url = process.env.DATABASE_URL_TEST;

describe.skipIf(!url)("modération des avis (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  const ids: string[] = [];
  const reviews: string[] = [];
  let adminId: string;
  const now = new Date();

  // Même filtre que le carrousel et la moyenne de l'accueil (server/social/reviews.ts)
  async function onHomePage(id: string) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT r."id" FROM "Review" r JOIN "User" u ON u."id" = r."userId"
      WHERE r."hidden" = false AND u."bannedAt" IS NULL AND r."id" = ${id}`;
    return rows.length === 1;
  }

  const state = (id: string) =>
    prisma.review.findUniqueOrThrow({ where: { id }, select: { hidden: true, pinned: true, reply: true, updatedAt: true } });

  beforeAll(async () => {
    const tag = randomBytes(4).toString("hex");
    const admin = await prisma.user.create({ data: { username: `test-adm-${tag}`, isGuest: false, role: "ADMIN" } });
    ids.push(admin.id);
    adminId = admin.id;
    for (let i = 0; i < 3; i++) {
      const author = await prisma.user.create({ data: { username: `test-rev-${tag}-${i}`, isGuest: false } });
      ids.push(author.id);
      reviews.push((await prisma.review.create({ data: { userId: author.id, rating: 4, body: `Test ${i}` } })).id);
    }
  });

  afterAll(async () => {
    await prisma.adminLog.deleteMany({ where: { adminId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it("un avis masqué quitte l'accueil, une seule ligne de journal même en double clic", async () => {
    const [id] = reviews as [string];
    const { updatedAt } = await state(id);
    expect(await onHomePage(id)).toBe(true);
    const results = await Promise.all([
      setReviewHiddenWith(prisma, { adminId, reviewId: id, hidden: true }),
      setReviewHiddenWith(prisma, { adminId, reviewId: id, hidden: true }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await onHomePage(id)).toBe(false);
    expect(await prisma.adminLog.count({ where: { targetId: id, action: "REVIEW_HIDE" } })).toBe(1);
    // La date affichée sur l'accueil reste celle de l'avis du joueur
    expect((await state(id)).updatedAt).toEqual(updatedAt);
  });

  it("réafficher le remet sur l'accueil", async () => {
    const [id] = reviews as [string];
    expect(await setReviewHiddenWith(prisma, { adminId, reviewId: id, hidden: false })).toBe(true);
    expect(await onHomePage(id)).toBe(true);
    expect(await setReviewHiddenWith(prisma, { adminId, reviewId: id, hidden: false })).toBe(false);
  });

  it("épingler : limite tenue même en parallèle, masquer désépingle, un avis masqué ne s'épingle pas", async () => {
    const results = await Promise.allSettled(
      reviews.map((reviewId) => setReviewPinnedWith(prisma, { adminId, reviewId, pinned: true, maxPinned: 2, now })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    const refused = results.find((r) => r.status === "rejected");
    expect(refused?.status === "rejected" && (refused.reason as ReviewModerationError).code).toBe("PIN_LIMIT");
    expect(await prisma.review.count({ where: { id: { in: reviews }, pinned: true } })).toBe(2);

    const pinned = (await prisma.review.findFirstOrThrow({ where: { id: { in: reviews }, pinned: true } })).id;
    await setReviewHiddenWith(prisma, { adminId, reviewId: pinned, hidden: true });
    expect(await state(pinned)).toMatchObject({ hidden: true, pinned: false });
    await expect(setReviewPinnedWith(prisma, { adminId, reviewId: pinned, pinned: true, maxPinned: 2, now })).rejects.toMatchObject({
      code: "HIDDEN",
    });

    for (const reviewId of reviews) {
      await setReviewHiddenWith(prisma, { adminId, reviewId, hidden: false });
      await setReviewPinnedWith(prisma, { adminId, reviewId, pinned: false, maxPinned: 2, now });
    }
  });

  it("répondre puis retirer la réponse", async () => {
    const [id] = reviews as [string];
    expect(await setReviewReplyWith(prisma, { adminId, reviewId: id, reply: "Merci !", now })).toBe(true);
    expect((await state(id)).reply).toBe("Merci !");
    expect(await setReviewReplyWith(prisma, { adminId, reviewId: id, reply: "Merci !", now })).toBe(false);
    expect(await setReviewReplyWith(prisma, { adminId, reviewId: id, reply: null, now })).toBe(true);
    expect((await state(id)).reply).toBeNull();
    expect(await prisma.adminLog.count({ where: { targetId: id, action: { in: ["REVIEW_REPLY", "REVIEW_REPLY_DELETE"] } } })).toBe(2);
  });

  it("avis inconnu : erreur dédiée", async () => {
    await expect(setReviewHiddenWith(prisma, { adminId, reviewId: "inconnu", hidden: true })).rejects.toBeInstanceOf(
      ReviewModerationError,
    );
  });
});
