ALTER TABLE "DiscordPost" ADD COLUMN "listingId" TEXT;
CREATE UNIQUE INDEX "DiscordPost_listingId_key" ON "DiscordPost"("listingId");
ALTER TABLE "DiscordPost" ADD CONSTRAINT "DiscordPost_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "TradeListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscordPost" ADD CONSTRAINT "DiscordPost_single_market_source"
    CHECK ("auctionId" IS NULL OR "listingId" IS NULL);
