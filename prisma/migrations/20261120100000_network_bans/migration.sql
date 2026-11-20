-- Bans réseau : IP (IPv4 exacte, IPv6 par préfixe /64) et appareils (cookie kiraku.device) bannis par l'admin,
-- ou pris automatiquement par un appareil banni (source AUTO, avec expiration).

-- CreateEnum
CREATE TYPE "NetworkBanSource" AS ENUM ('MANUAL', 'GROUP', 'AUTO');

-- CreateTable
CREATE TABLE "NetworkBan" (
    "id" TEXT NOT NULL,
    "kind" "SignalKind" NOT NULL,
    "value" VARCHAR(64) NOT NULL,
    "source" "NetworkBanSource" NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "userId" TEXT,
    "createdById" TEXT,
    "parentId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "hits" INTEGER NOT NULL DEFAULT 0,
    "lastHitAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NetworkBan_pkey" PRIMARY KEY ("id"),
    -- Seul un ban automatique suit un appareil et expire ; rendu définitif, il perd les deux mais reste AUTO
    CONSTRAINT "NetworkBan_auto_check" CHECK ("source" = 'AUTO' OR ("parentId" IS NULL AND "expiresAt" IS NULL)),
    CONSTRAINT "NetworkBan_hits_check" CHECK ("hits" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "NetworkBan_kind_value_key" ON "NetworkBan"("kind", "value");

-- CreateIndex
CREATE INDEX "NetworkBan_userId_idx" ON "NetworkBan"("userId");

-- CreateIndex
CREATE INDEX "NetworkBan_parentId_idx" ON "NetworkBan"("parentId");

-- CreateIndex
CREATE INDEX "NetworkBan_createdAt_idx" ON "NetworkBan"("createdAt");

-- AddForeignKey
ALTER TABLE "NetworkBan" ADD CONSTRAINT "NetworkBan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkBan" ADD CONSTRAINT "NetworkBan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkBan" ADD CONSTRAINT "NetworkBan_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "NetworkBan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
