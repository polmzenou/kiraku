-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'TRADE_PROPOSED';
ALTER TYPE "NotificationType" ADD VALUE 'TRADE_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE 'TRADE_DECLINED';

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "proposerId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "wantedCardId" TEXT NOT NULL,
    "chosenCardId" TEXT,
    "status" "TradeStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "proposerSeenAt" TIMESTAMP(3),

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeOffer" (
    "tradeId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,

    CONSTRAINT "TradeOffer_pkey" PRIMARY KEY ("tradeId","cardId")
);

-- CreateIndex
CREATE INDEX "Trade_recipientId_status_createdAt_idx" ON "Trade"("recipientId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Trade_proposerId_status_createdAt_idx" ON "Trade"("proposerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Trade_status_expiresAt_idx" ON "Trade"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_wantedCardId_fkey" FOREIGN KEY ("wantedCardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_chosenCardId_fkey" FOREIGN KEY ("chosenCardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOffer" ADD CONSTRAINT "TradeOffer_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOffer" ADD CONSTRAINT "TradeOffer_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
