-- Une seule transaction : la reprise des boosters offerts et la suppression de la colonne réussissent ensemble ou pas du tout
BEGIN;

-- CreateEnum
CREATE TYPE "LotItemKind" AS ENUM ('BOOSTER', 'CARD', 'RARITY_CARD');

-- CreateEnum
CREATE TYPE "MissionPeriod" AS ENUM ('DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "MissionMetric" AS ENUM ('VISIT', 'OPEN_BOOSTERS', 'PULL_RARITY', 'DISCOVER_CARDS', 'RECYCLE_ZENI', 'SPEND_ZENI', 'SEND_GIFTS', 'ADD_FRIENDS');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'QUALIFIED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ShopLimitPeriod" AS ENUM ('ONCE', 'DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "PurchaseCurrency" AS ENUM ('ZENI', 'EUR');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'REFERRAL_QUALIFIED';

-- DropIndex
DROP INDEX "CoinTransaction_userId_createdAt_idx";

-- AlterTable
ALTER TABLE "CoinTransaction" ADD COLUMN     "balanceAfter" INTEGER;

-- Codes de parrainage courts : 8 caractères sans 0/O/1/I (lisibles, faciles à dicter).
-- Le code n'est pas un secret (il est partagé) : random() suffit, l'unicité est garantie par l'index.
CREATE FUNCTION kiraku_referral_code() RETURNS TEXT LANGUAGE sql VOLATILE AS $$
  SELECT string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + floor(random() * 32)::int, 1), '')
  FROM generate_series(1, 8)
$$;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "referralCode" SET DEFAULT kiraku_referral_code();
UPDATE "User" SET "referralCode" = kiraku_referral_code();

-- Filet de sécurité : un solde ne passe jamais sous zéro, même en cas de bug applicatif
ALTER TABLE "User" ADD CONSTRAINT "User_coins_nonnegative" CHECK ("coins" >= 0);

-- CreateTable
CREATE TABLE "BoosterCredit" (
    "userId" TEXT NOT NULL,
    "boosterTypeId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoosterCredit_pkey" PRIMARY KEY ("userId","boosterTypeId")
);

-- CreateTable
CREATE TABLE "Lot" (
    "id" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "zeni" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LotItem" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "kind" "LotItemKind" NOT NULL,
    "boosterTypeId" TEXT,
    "cardId" TEXT,
    "rarity" "Rarity",
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "LotItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "period" "MissionPeriod" NOT NULL,
    "metric" "MissionMetric" NOT NULL,
    "goal" INTEGER NOT NULL,
    "rarity" "Rarity",
    "title" JSONB,
    "lotId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserMission" (
    "userId" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserMission_pkey" PRIMARY KEY ("userId","missionId","periodKey")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "refereeId" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "qualifiedAt" TIMESTAMP(3),
    "referrerClaimedAt" TIMESTAMP(3),
    "refereeClaimedAt" TIMESTAMP(3),

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopItem" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB NOT NULL,
    "lotId" TEXT NOT NULL,
    "priceZeni" INTEGER,
    "priceCents" INTEGER,
    "stripePriceId" TEXT,
    "perUserLimit" INTEGER,
    "limitPeriod" "ShopLimitPeriod",
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shopItemId" TEXT NOT NULL,
    "currency" "PurchaseCurrency" NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "providerRef" TEXT,
    "periodKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LotItem_lotId_idx" ON "LotItem"("lotId");

-- CreateIndex
CREATE UNIQUE INDEX "Mission_key_key" ON "Mission"("key");

-- CreateIndex
CREATE INDEX "Mission_active_period_sortOrder_idx" ON "Mission"("active", "period", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_refereeId_key" ON "Referral"("refereeId");

-- CreateIndex
CREATE INDEX "Referral_referrerId_createdAt_idx" ON "Referral"("referrerId", "createdAt");

-- CreateIndex
CREATE INDEX "Referral_createdAt_idx" ON "Referral"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShopItem_slug_key" ON "ShopItem"("slug");

-- CreateIndex
CREATE INDEX "ShopItem_active_sortOrder_idx" ON "ShopItem"("active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_providerRef_key" ON "Purchase"("providerRef");

-- CreateIndex
CREATE INDEX "Purchase_userId_shopItemId_periodKey_idx" ON "Purchase"("userId", "shopItemId", "periodKey");

-- CreateIndex
CREATE INDEX "Purchase_createdAt_idx" ON "Purchase"("createdAt");

-- CreateIndex
CREATE INDEX "CoinTransaction_userId_createdAt_id_idx" ON "CoinTransaction"("userId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Discovery_userId_createdAt_idx" ON "Discovery"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Gift_senderId_createdAt_idx" ON "Gift"("senderId", "createdAt");

-- AddForeignKey
ALTER TABLE "BoosterCredit" ADD CONSTRAINT "BoosterCredit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoosterCredit" ADD CONSTRAINT "BoosterCredit_boosterTypeId_fkey" FOREIGN KEY ("boosterTypeId") REFERENCES "BoosterType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotItem" ADD CONSTRAINT "LotItem_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotItem" ADD CONSTRAINT "LotItem_boosterTypeId_fkey" FOREIGN KEY ("boosterTypeId") REFERENCES "BoosterType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotItem" ADD CONSTRAINT "LotItem_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMission" ADD CONSTRAINT "UserMission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMission" ADD CONSTRAINT "UserMission_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopItem" ADD CONSTRAINT "ShopItem_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_shopItemId_fkey" FOREIGN KEY ("shopItemId") REFERENCES "ShopItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- CHECK
ALTER TABLE "BoosterCredit" ADD CONSTRAINT "BoosterCredit_count_nonnegative" CHECK ("count" >= 0);
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_zeni_nonnegative" CHECK ("zeni" >= 0);
ALTER TABLE "LotItem" ADD CONSTRAINT "LotItem_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_amount_nonnegative" CHECK ("amount" >= 0);

-- Boosters offerts par des amis (User.giftBoosters, étape 6) : deviennent des crédits du booster standard
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "User" WHERE "giftBoosters" > 0)
     AND NOT EXISTS (SELECT 1 FROM "BoosterType" WHERE slug = 'standard') THEN
    RAISE EXCEPTION 'Boosters offerts à reprendre mais aucun BoosterType « standard »';
  END IF;
END $$;

INSERT INTO "BoosterCredit" ("userId", "boosterTypeId", "count", "updatedAt")
SELECT u.id, bt.id, u."giftBoosters", CURRENT_TIMESTAMP
FROM "User" u JOIN "BoosterType" bt ON bt.slug = 'standard'
WHERE u."giftBoosters" > 0;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "giftBoosters";

COMMIT;
