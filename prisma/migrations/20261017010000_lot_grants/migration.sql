-- Étape 10 : lots envoyés depuis l'admin à un joueur ou à tous (reprenable), notification « cadeau de l'équipe ».
-- CreateEnum
CREATE TYPE "LotBroadcastStatus" AS ENUM ('RUNNING', 'DONE');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'LOT_GRANTED';

-- CreateTable
CREATE TABLE "LotGrant" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "broadcastId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LotGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LotBroadcast" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "reason" TEXT,
    "status" "LotBroadcastStatus" NOT NULL DEFAULT 'RUNNING',
    "lastUserId" TEXT,
    "granted" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "LotBroadcast_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LotGrant_userId_createdAt_idx" ON "LotGrant"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LotGrant_lotId_idx" ON "LotGrant"("lotId");

-- CreateIndex
CREATE UNIQUE INDEX "LotGrant_broadcastId_userId_key" ON "LotGrant"("broadcastId", "userId");

-- CreateIndex
CREATE INDEX "LotBroadcast_status_createdAt_idx" ON "LotBroadcast"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "LotGrant" ADD CONSTRAINT "LotGrant_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotGrant" ADD CONSTRAINT "LotGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotGrant" ADD CONSTRAINT "LotGrant_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotGrant" ADD CONSTRAINT "LotGrant_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "LotBroadcast"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotBroadcast" ADD CONSTRAINT "LotBroadcast_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotBroadcast" ADD CONSTRAINT "LotBroadcast_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

