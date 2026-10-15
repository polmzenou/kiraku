-- Étape 9 : combat 1v1 en direct (parties, journal des actions, file d'attente).
-- defenseTeam (classé contre une défense hors ligne) n'existe plus : la colonne devient la dernière équipe jouée.
-- CreateEnum
CREATE TYPE "BattleMode" AS ENUM ('FRIEND', 'EXHIBITION', 'RANKED');

-- CreateEnum
CREATE TYPE "BattleStatus" AS ENUM ('WAITING', 'ACTIVE', 'FINISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BattleEndReason" AS ENUM ('KO', 'FORFEIT', 'TIMEOUT', 'TURN_LIMIT');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'BATTLE_INVITE';

-- AlterTable
ALTER TABLE "User" RENAME COLUMN "defenseTeam" TO "battleTeam";

-- CreateTable
CREATE TABLE "Battle" (
    "id" TEXT NOT NULL,
    "mode" "BattleMode" NOT NULL,
    "status" "BattleStatus" NOT NULL DEFAULT 'WAITING',
    "code" TEXT,
    "codeExpiresAt" TIMESTAMP(3),
    "seed" INTEGER NOT NULL,
    "p1Id" TEXT NOT NULL,
    "p2Id" TEXT,
    "botName" TEXT,
    "p1Team" TEXT[],
    "p2Team" TEXT[],
    "setup" JSONB,
    "state" JSONB,
    "version" INTEGER NOT NULL DEFAULT 0,
    "turnEndsAt" TIMESTAMP(3),
    "winnerSide" INTEGER,
    "endReason" "BattleEndReason",
    "rewardZeni" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Battle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BattleAction" (
    "battleId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "side" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BattleAction_pkey" PRIMARY KEY ("battleId","seq")
);

-- CreateTable
CREATE TABLE "BattleQueue" (
    "userId" TEXT NOT NULL,
    "mode" "BattleMode" NOT NULL,
    "rankPoints" INTEGER NOT NULL,
    "team" TEXT[],
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BattleQueue_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Battle_code_key" ON "Battle"("code");

-- CreateIndex
CREATE INDEX "Battle_p1Id_createdAt_idx" ON "Battle"("p1Id", "createdAt");

-- CreateIndex
CREATE INDEX "Battle_p2Id_createdAt_idx" ON "Battle"("p2Id", "createdAt");

-- CreateIndex
CREATE INDEX "Battle_status_turnEndsAt_idx" ON "Battle"("status", "turnEndsAt");

-- CreateIndex
CREATE INDEX "BattleQueue_mode_joinedAt_idx" ON "BattleQueue"("mode", "joinedAt");

-- AddForeignKey
ALTER TABLE "Battle" ADD CONSTRAINT "Battle_p1Id_fkey" FOREIGN KEY ("p1Id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battle" ADD CONSTRAINT "Battle_p2Id_fkey" FOREIGN KEY ("p2Id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleAction" ADD CONSTRAINT "BattleAction_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "Battle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleQueue" ADD CONSTRAINT "BattleQueue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
