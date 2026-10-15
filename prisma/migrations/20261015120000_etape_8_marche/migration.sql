-- CreateEnum
CREATE TYPE "AuctionStatus" AS ENUM ('ACTIVE', 'SOLD', 'EXPIRED', 'CANCELLED');

-- AlterEnum


ALTER TYPE "NotificationType" ADD VALUE 'OUTBID';
ALTER TYPE "NotificationType" ADD VALUE 'AUCTION_WON';
ALTER TYPE "NotificationType" ADD VALUE 'AUCTION_SOLD';
ALTER TYPE "NotificationType" ADD VALUE 'AUCTION_EXPIRED';
ALTER TYPE "NotificationType" ADD VALUE 'AUCTION_CANCELLED';

-- CreateTable
CREATE TABLE "Auction" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "userCardId" TEXT,
    "cardId" TEXT NOT NULL,
    "startPrice" INTEGER NOT NULL,
    "buyoutPrice" INTEGER,
    "currentBid" INTEGER,
    "currentBidderId" TEXT,
    "price" INTEGER NOT NULL,
    "bidCount" INTEGER NOT NULL DEFAULT 0,
    "feeBp" INTEGER NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "AuctionStatus" NOT NULL DEFAULT 'ACTIVE',
    "finalPrice" INTEGER,
    "fee" INTEGER,
    "settledAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Auction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bid" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "bidderId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Auction_status_endsAt_id_idx" ON "Auction"("status", "endsAt", "id");

-- CreateIndex
CREATE INDEX "Auction_status_price_id_idx" ON "Auction"("status", "price", "id");

-- CreateIndex
CREATE INDEX "Auction_status_createdAt_id_idx" ON "Auction"("status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Auction_sellerId_status_idx" ON "Auction"("sellerId", "status");

-- CreateIndex
CREATE INDEX "Auction_currentBidderId_status_idx" ON "Auction"("currentBidderId", "status");

-- CreateIndex
CREATE INDEX "Auction_cardId_status_idx" ON "Auction"("cardId", "status");

-- CreateIndex
CREATE INDEX "Bid_auctionId_createdAt_idx" ON "Bid"("auctionId", "createdAt");

-- CreateIndex
CREATE INDEX "Bid_bidderId_createdAt_idx" ON "Bid"("bidderId", "createdAt");

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_userCardId_fkey" FOREIGN KEY ("userCardId") REFERENCES "UserCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_currentBidderId_fkey" FOREIGN KEY ("currentBidderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Une carte ne peut être que dans une seule vente ouverte : une double mise en vente concurrente
-- échoue ici même si les deux transactions ont vu l'exemplaire libre.
CREATE UNIQUE INDEX "Auction_userCardId_active_key" ON "Auction"("userCardId") WHERE "status" = 'ACTIVE';

-- CHECK
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_startPrice_positive" CHECK ("startPrice" >= 1);
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_price_at_least_start" CHECK ("price" >= "startPrice");
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_buyout_above_start" CHECK ("buyoutPrice" IS NULL OR "buyoutPrice" > "startPrice");
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_bid_has_bidder" CHECK (("currentBid" IS NULL) = ("currentBidderId" IS NULL));
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_fee_bp_range" CHECK ("feeBp" BETWEEN 0 AND 10000);
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_amount_positive" CHECK ("amount" >= 1);
