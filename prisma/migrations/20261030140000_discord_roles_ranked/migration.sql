ALTER TABLE "Season" ADD COLUMN "leaderboardSnapshot" JSONB;
ALTER TABLE "DiscordPost" ADD COLUMN "seasonId" TEXT;
CREATE UNIQUE INDEX "DiscordPost_seasonId_key" ON "DiscordPost"("seasonId");
ALTER TABLE "DiscordPost" ADD CONSTRAINT "DiscordPost_seasonId_fkey"
    FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscordPost" DROP CONSTRAINT "DiscordPost_single_market_source";
ALTER TABLE "DiscordPost" ADD CONSTRAINT "DiscordPost_single_source"
    CHECK (num_nonnulls("auctionId", "listingId", "seasonId") <= 1);
CREATE TABLE "DiscordRoleSync" (
    "guildId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseId" TEXT,
    "leaseUntil" TIMESTAMP(3),
    CONSTRAINT "DiscordRoleSync_pkey" PRIMARY KEY ("guildId", "discordId")
);
CREATE INDEX "DiscordRoleSync_nextAttemptAt_idx" ON "DiscordRoleSync"("nextAttemptAt");
