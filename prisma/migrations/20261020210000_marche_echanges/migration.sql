-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('OPEN', 'TRADED', 'CANCELLED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "ListingOfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'CLOSED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'LISTING_OFFER';
ALTER TYPE "NotificationType" ADD VALUE 'LISTING_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE 'LISTING_DECLINED';

-- CreateTable
CREATE TABLE "TradeListing" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'OPEN',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "TradeListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeListingWant" (
    "listingId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,

    CONSTRAINT "TradeListingWant_pkey" PRIMARY KEY ("listingId","cardId")
);

-- CreateTable
CREATE TABLE "ListingOffer" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "bidderId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "fromWants" BOOLEAN NOT NULL,
    "status" "ListingOfferStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "bidderSeenAt" TIMESTAMP(3),
    "bidderNew" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ListingOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TradeListing_status_createdAt_id_idx" ON "TradeListing"("status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "TradeListing_status_expiresAt_idx" ON "TradeListing"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "TradeListing_ownerId_status_idx" ON "TradeListing"("ownerId", "status");

-- CreateIndex
CREATE INDEX "TradeListing_cardId_status_idx" ON "TradeListing"("cardId", "status");

-- CreateIndex
CREATE INDEX "TradeListingWant_cardId_idx" ON "TradeListingWant"("cardId");

-- CreateIndex
CREATE INDEX "ListingOffer_listingId_status_idx" ON "ListingOffer"("listingId", "status");

-- CreateIndex
CREATE INDEX "ListingOffer_bidderId_status_createdAt_idx" ON "ListingOffer"("bidderId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "TradeListing" ADD CONSTRAINT "TradeListing_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeListing" ADD CONSTRAINT "TradeListing_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeListingWant" ADD CONSTRAINT "TradeListingWant_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "TradeListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeListingWant" ADD CONSTRAINT "TradeListingWant_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingOffer" ADD CONSTRAINT "ListingOffer_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "TradeListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingOffer" ADD CONSTRAINT "ListingOffer_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingOffer" ADD CONSTRAINT "ListingOffer_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

