-- Expéditions (étape 14) : modèles réglables dans l'admin, expéditions lancées (cartes en EXPEDITION,
-- chances et gains photographiés au lancement, résultat tiré à la clôture) et offres du jour par joueur.
-- Les nouvelles valeurs d'enum ne servent à rien dans cette migration (ALTER TYPE … ADD VALUE).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
-- CreateEnum
CREATE TYPE "ExpeditionRisk" AS ENUM ('SAFE', 'BALANCED', 'RISKY');

-- CreateEnum
CREATE TYPE "ExpeditionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "ExpeditionOutcome" AS ENUM ('FAILURE', 'SUCCESS', 'TRIUMPH');

-- AlterEnum
ALTER TYPE "CoinReason" ADD VALUE 'EXPEDITION';

-- AlterEnum
ALTER TYPE "CardStatus" ADD VALUE 'EXPEDITION';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'EXPEDITION_RETURNED';

-- CreateTable
CREATE TABLE "ExpeditionType" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "lore" JSONB NOT NULL DEFAULT '{}',
    "minRarity" TEXT NOT NULL,
    "risk" "ExpeditionRisk" NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "baseSuccessPct" INTEGER NOT NULL,
    "maxSuccessPct" INTEGER NOT NULL,
    "maxTriumphPct" INTEGER NOT NULL,
    "minDiscoveryPct" INTEGER NOT NULL DEFAULT 0,
    "zeni" INTEGER NOT NULL DEFAULT 0,
    "boosterTypeId" TEXT NOT NULL,
    "boosters" INTEGER NOT NULL DEFAULT 0,
    "extraLotId" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 10,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpeditionType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expedition" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "userCardIds" TEXT[],
    "cardIds" TEXT[],
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "successPct" INTEGER NOT NULL,
    "triumphPct" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "status" "ExpeditionStatus" NOT NULL DEFAULT 'ACTIVE',
    "outcome" "ExpeditionOutcome",
    "roll" INTEGER,
    "rewardCardIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "settledAt" TIMESTAMP(3),
    "revealedAt" TIMESTAMP(3),
    "abandonedAt" TIMESTAMP(3),
    "cooldownUntil" TIMESTAMP(3),

    CONSTRAINT "Expedition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpeditionBoard" (
    "userId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "typeIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpeditionBoard_pkey" PRIMARY KEY ("userId","dayKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpeditionType_slug_key" ON "ExpeditionType"("slug");

-- CreateIndex
CREATE INDEX "ExpeditionType_active_idx" ON "ExpeditionType"("active");

-- CreateIndex
CREATE INDEX "Expedition_userId_startedAt_idx" ON "Expedition"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "Expedition_status_endsAt_idx" ON "Expedition"("status", "endsAt");

-- CreateIndex
CREATE INDEX "Expedition_typeId_idx" ON "Expedition"("typeId");

-- CreateIndex
CREATE INDEX "ExpeditionBoard_createdAt_idx" ON "ExpeditionBoard"("createdAt");

-- AddForeignKey
ALTER TABLE "ExpeditionType" ADD CONSTRAINT "ExpeditionType_minRarity_fkey" FOREIGN KEY ("minRarity") REFERENCES "RarityDefinition"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpeditionType" ADD CONSTRAINT "ExpeditionType_boosterTypeId_fkey" FOREIGN KEY ("boosterTypeId") REFERENCES "BoosterType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpeditionType" ADD CONSTRAINT "ExpeditionType_extraLotId_fkey" FOREIGN KEY ("extraLotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expedition" ADD CONSTRAINT "Expedition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expedition" ADD CONSTRAINT "Expedition_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ExpeditionType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpeditionBoard" ADD CONSTRAINT "ExpeditionBoard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Une seule expédition en route par joueur
CREATE UNIQUE INDEX "Expedition_userId_active_key" ON "Expedition"("userId") WHERE "status" = 'ACTIVE';
-- Chaque offre du jour se joue une fois (un abandon la laisse rejouable)
CREATE UNIQUE INDEX "Expedition_userId_dayKey_slot_key" ON "Expedition"("userId", "dayKey", "slot") WHERE "status" <> 'ABANDONED';

-- Bornes des modèles (le formulaire admin les vérifie aussi)
ALTER TABLE "ExpeditionType" ADD CONSTRAINT "ExpeditionType_bounds" CHECK (
  "durationMinutes" BETWEEN 1 AND 4320
  AND "baseSuccessPct" BETWEEN 0 AND 100
  AND "maxSuccessPct" BETWEEN "baseSuccessPct" AND 100
  AND "maxTriumphPct" BETWEEN 0 AND 100
  AND "minDiscoveryPct" BETWEEN 0 AND 100
  AND "zeni" >= 0 AND "boosters" >= 0 AND "weight" >= 0
);
ALTER TABLE "Expedition" ADD CONSTRAINT "Expedition_chances" CHECK (
  "successPct" BETWEEN 0 AND 10000 AND "triumphPct" BETWEEN 0 AND "successPct"
);
COMMIT;
