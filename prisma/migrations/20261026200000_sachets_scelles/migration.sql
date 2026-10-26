-- CreateEnum
CREATE TYPE "SealedSource" AS ENUM ('DRAW', 'GIFT', 'LOT', 'ADMIN');

-- CreateEnum
CREATE TYPE "ApocalypseOutcome" AS ENUM ('SPARED', 'RUINED');

-- AlterEnum
ALTER TYPE "BoosterKind" ADD VALUE 'DROP';

-- AlterEnum
ALTER TYPE "GiftKind" ADD VALUE 'SEALED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SEALED_OPENED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "apocalypseKarma" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "BoosterOpening" ADD COLUMN     "apocalypse" "ApocalypseOutcome",
ADD COLUMN     "sealedDropId" TEXT;

-- AlterTable
ALTER TABLE "Gift" ADD COLUMN     "sealedDropId" TEXT;

-- CreateTable
CREATE TABLE "SealedDrop" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "boosterTypeId" TEXT NOT NULL,
    "source" "SealedSource" NOT NULL,
    "giverId" TEXT,
    "giftable" BOOLEAN NOT NULL DEFAULT false,
    "openingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" TIMESTAMP(3),

    CONSTRAINT "SealedDrop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SealedDrop_ownerId_openedAt_idx" ON "SealedDrop"("ownerId", "openedAt");

-- CreateIndex
CREATE INDEX "SealedDrop_giverId_idx" ON "SealedDrop"("giverId");

-- CreateIndex
CREATE INDEX "SealedDrop_boosterTypeId_idx" ON "SealedDrop"("boosterTypeId");

-- AddForeignKey
ALTER TABLE "SealedDrop" ADD CONSTRAINT "SealedDrop_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SealedDrop" ADD CONSTRAINT "SealedDrop_boosterTypeId_fkey" FOREIGN KEY ("boosterTypeId") REFERENCES "BoosterType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SealedDrop" ADD CONSTRAINT "SealedDrop_giverId_fkey" FOREIGN KEY ("giverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Le karma ne descend jamais sous zéro
ALTER TABLE "User" ADD CONSTRAINT "User_apocalypseKarma_check" CHECK ("apocalypseKarma" >= 0);

-- booster.divineOdds change de sens (chute d'un sachet Divin, plus un divin instantané) :
-- l'ancienne valeur par défaut passe à la nouvelle, une valeur réglée à la main est gardée
UPDATE "GameSetting" SET "value" = '4000'::jsonb, "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'booster.divineOdds' AND "value" = '2000'::jsonb;
