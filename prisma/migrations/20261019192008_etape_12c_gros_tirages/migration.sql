-- CreateTable
CREATE TABLE "NotablePull" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "rarity" "Rarity" NOT NULL,
    "boosterSlug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotablePull_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotablePull_createdAt_idx" ON "NotablePull"("createdAt");

-- AddForeignKey
ALTER TABLE "NotablePull" ADD CONSTRAINT "NotablePull_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotablePull" ADD CONSTRAINT "NotablePull_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Amorce : gros tirages des 48 dernières heures, relus dans les ouvertures déjà enregistrées
INSERT INTO "NotablePull" ("id", "userId", "cardId", "rarity", "boosterSlug", "createdAt")
SELECT gen_random_uuid()::text, o."userId", c."id", c."rarity", o."boosterSlug", o."createdAt"
FROM "BoosterOpening" o
CROSS JOIN LATERAL unnest(o."catalogCardIds") AS drawn("cardId")
JOIN "Card" c ON c."id" = drawn."cardId"
WHERE o."createdAt" > now() - interval '48 hours'
  AND c."rarity" IN ('EPIC', 'LEGENDARY', 'MYTHIC');
