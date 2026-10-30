CREATE TABLE "DiscordPost" (
    "key" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "payloadHash" TEXT,
    "auctionId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "leaseId" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiscordPost_pkey" PRIMARY KEY ("key")
);
CREATE UNIQUE INDEX "DiscordPost_auctionId_key" ON "DiscordPost"("auctionId");
CREATE INDEX "DiscordPost_nextAttemptAt_idx" ON "DiscordPost"("nextAttemptAt");
ALTER TABLE "DiscordPost" ADD CONSTRAINT "DiscordPost_auctionId_fkey"
    FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
