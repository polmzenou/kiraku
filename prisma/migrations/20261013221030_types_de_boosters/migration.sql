-- CreateEnum
CREATE TYPE "BoosterKind" AS ENUM ('STANDARD', 'RARITY', 'FILTERED', 'BANNER', 'FORMAT');

-- CreateEnum
CREATE TYPE "BoosterShape" AS ENUM ('SACHET', 'POCHIBUKURO', 'JUBAKO');

-- AlterEnum
ALTER TYPE "CoinReason" ADD VALUE 'BOOSTER';

-- AlterTable
ALTER TABLE "BoosterOpening" ADD COLUMN     "featuredHit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "zeniSpent" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "BoosterType" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "BoosterKind" NOT NULL,
    "family" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "name" JSONB NOT NULL,
    "tagline" JSONB NOT NULL,
    "emblem" TEXT NOT NULL,
    "shape" "BoosterShape" NOT NULL DEFAULT 'SACHET',
    "theme" JSONB NOT NULL,
    "filter" JSONB NOT NULL DEFAULT '{}',
    "slotFloors" TEXT[],
    "usesFreeStock" BOOLEAN NOT NULL DEFAULT true,
    "priceZeni" INTEGER,
    "countsForPity" BOOLEAN NOT NULL DEFAULT true,
    "bonusEligible" BOOLEAN NOT NULL DEFAULT true,
    "featuredCardIds" TEXT[],
    "featuredRate" INTEGER NOT NULL DEFAULT 5000,
    "featuredPity" INTEGER NOT NULL DEFAULT 100,
    "minPoolSize" INTEGER,
    "poolCardIds" TEXT[],
    "poolCounts" JSONB,
    "poolComputedAt" TIMESTAMP(3),
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoosterType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BoosterType_slug_key" ON "BoosterType"("slug");

-- CreateIndex
CREATE INDEX "BoosterType_family_sortOrder_idx" ON "BoosterType"("family", "sortOrder");
