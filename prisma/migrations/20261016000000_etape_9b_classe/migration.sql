-- Étape 9b : classé (protection, meilleur rang de saison, PC par partie) et saisons avec leurs bilans.
-- AlterEnum
ALTER TYPE "CoinReason" ADD VALUE 'SEASON';

-- AlterTable
ALTER TABLE "Battle" ADD COLUMN     "crushing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "p1Tier" TEXT,
ADD COLUMN     "p2Tier" TEXT,
ADD COLUMN     "pcBeforeP1" INTEGER,
ADD COLUMN     "pcBeforeP2" INTEGER,
ADD COLUMN     "pcDeltaP1" INTEGER,
ADD COLUMN     "pcDeltaP2" INTEGER,
ADD COLUMN     "seasonId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "rankProtection" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "seasonGames" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "seasonPeakGrand" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "seasonPeakPc" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonResult" (
    "seasonId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "finalPc" INTEGER NOT NULL,
    "peakPc" INTEGER NOT NULL,
    "peakTier" TEXT NOT NULL,
    "games" INTEGER NOT NULL,
    "lotId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeasonResult_pkey" PRIMARY KEY ("seasonId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Season_number_key" ON "Season"("number");

-- CreateIndex
CREATE INDEX "Season_closedAt_endsAt_idx" ON "Season"("closedAt", "endsAt");

-- CreateIndex
CREATE INDEX "SeasonResult_userId_claimedAt_idx" ON "SeasonResult"("userId", "claimedAt");

-- AddForeignKey
ALTER TABLE "Battle" ADD CONSTRAINT "Battle_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonResult" ADD CONSTRAINT "SeasonResult_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonResult" ADD CONSTRAINT "SeasonResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
