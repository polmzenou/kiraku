-- Commentaires (annonces, échanges, ventes, refus), mot de l'équipe sur les cadeaux, cadeaux de la fiche joueur

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TEAM_GIFT';

-- AlterTable
ALTER TABLE "Auction" ADD COLUMN "note" VARCHAR(200);

-- AlterTable
ALTER TABLE "LotBroadcast" ADD COLUMN "message" VARCHAR(200);

-- AlterTable
ALTER TABLE "LotGrant" ADD COLUMN "message" VARCHAR(200);

-- AlterTable
ALTER TABLE "ListingOffer" ADD COLUMN "declineNote" VARCHAR(200);

-- AlterTable
ALTER TABLE "Trade" ADD COLUMN "declineNote" VARCHAR(200),
ADD COLUMN "note" VARCHAR(200);

-- AlterTable
ALTER TABLE "TradeListing" ADD COLUMN "note" VARCHAR(200);

-- CreateTable
CREATE TABLE "TeamGift" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "kind" "GiftKind" NOT NULL,
    "cardId" TEXT,
    "boosterTypeId" TEXT,
    "quantity" INTEGER NOT NULL,
    "message" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamGift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamGift_userId_createdAt_idx" ON "TeamGift"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "TeamGift" ADD CONSTRAINT "TeamGift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
