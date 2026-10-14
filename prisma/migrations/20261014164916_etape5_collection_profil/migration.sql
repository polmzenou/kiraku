-- CreateEnum
CREATE TYPE "ProfileVisibility" AS ENUM ('PUBLIC', 'FRIENDS', 'PRIVATE');

-- AlterTable
ALTER TABLE "BoosterOpening" ADD COLUMN     "catalogCardIds" TEXT[];

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "privacyChosenAt" TIMESTAMP(3),
ADD COLUMN     "profileVisibility" "ProfileVisibility" NOT NULL DEFAULT 'PUBLIC',
ADD COLUMN     "showCollection" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ShowcaseSlot" (
    "userId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "userCardId" TEXT NOT NULL,

    CONSTRAINT "ShowcaseSlot_pkey" PRIMARY KEY ("userId","position")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShowcaseSlot_userCardId_key" ON "ShowcaseSlot"("userCardId");

-- DropIndex (couvert par le nouvel index ci-dessous)
DROP INDEX "UserCard_ownerId_status_idx";

-- CreateIndex
CREATE INDEX "UserCard_ownerId_status_cardId_idx" ON "UserCard"("ownerId", "status", "cardId");

-- AddForeignKey
ALTER TABLE "ShowcaseSlot" ADD CONSTRAINT "ShowcaseSlot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowcaseSlot" ADD CONSTRAINT "ShowcaseSlot_userCardId_fkey" FOREIGN KEY ("userCardId") REFERENCES "UserCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Données : ids de Card des tirages existants, dans l'ordre des emplacements
UPDATE "BoosterOpening" bo
SET "catalogCardIds" = sub.ids
FROM (
  SELECT o.id, array_agg(uc."cardId" ORDER BY slot.pos) AS ids
  FROM "BoosterOpening" o
  CROSS JOIN LATERAL unnest(o."cardIds") WITH ORDINALITY AS slot(user_card_id, pos)
  JOIN "UserCard" uc ON uc.id = slot.user_card_id
  GROUP BY o.id
) sub
WHERE bo.id = sub.id;

UPDATE "BoosterOpening" SET "catalogCardIds" = '{}' WHERE "catalogCardIds" IS NULL;

-- Données : profils des invités existants privés par défaut
UPDATE "User" SET "profileVisibility" = 'PRIVATE' WHERE "isGuest" = true;
