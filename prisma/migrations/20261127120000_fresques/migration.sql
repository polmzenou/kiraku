-- Fresques 絵 : une grande image découpée en 4 × 3 fragments tirés des boosters (docs/PLAN.md, « Fresques »).
-- Uniquement additive : la version en ligne pendant le déploiement l'ignore.

-- CreateEnum
CREATE TYPE "FrescoStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FrescoRewardKind" AS ENUM ('PIECE', 'ROW', 'COLUMN', 'COMPLETE');

-- AlterEnum
ALTER TYPE "CoinReason" ADD VALUE 'FRESCO';

-- AlterTable
ALTER TABLE "Showcase" ADD COLUMN     "frescoFirst" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "frescoId" TEXT;

-- CreateTable
CREATE TABLE "Fresco" (
    "id" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "status" "FrescoStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "cols" INTEGER NOT NULL DEFAULT 4,
    "rows" INTEGER NOT NULL DEFAULT 3,
    "imageUrl" TEXT,
    "teaserUrl" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "universeId" TEXT,
    "spoiler" BOOLEAN NOT NULL DEFAULT false,
    "boosterTypeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dropWeight" INTEGER NOT NULL DEFAULT 1,
    "pieceLotId" TEXT,
    "rowLotId" TEXT,
    "columnLotId" TEXT,
    "completeLotId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fresco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FrescoPiece" (
    "id" TEXT NOT NULL,
    "frescoId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "imageUrl" TEXT NOT NULL,

    CONSTRAINT "FrescoPiece_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFrescoPiece" (
    "userId" TEXT NOT NULL,
    "pieceId" TEXT NOT NULL,
    "frescoId" TEXT NOT NULL,
    "obtainedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserFrescoPiece_pkey" PRIMARY KEY ("userId","pieceId")
);

-- CreateTable
CREATE TABLE "FrescoReward" (
    "userId" TEXT NOT NULL,
    "frescoId" TEXT NOT NULL,
    "kind" "FrescoRewardKind" NOT NULL,
    "index" INTEGER NOT NULL,
    "lotId" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FrescoReward_pkey" PRIMARY KEY ("userId","frescoId","kind","index")
);

-- CreateIndex
CREATE INDEX "Fresco_status_publishedAt_idx" ON "Fresco"("status", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FrescoPiece_frescoId_position_key" ON "FrescoPiece"("frescoId", "position");

-- CreateIndex
CREATE INDEX "UserFrescoPiece_userId_frescoId_idx" ON "UserFrescoPiece"("userId", "frescoId");

-- CreateIndex
CREATE INDEX "UserFrescoPiece_frescoId_idx" ON "UserFrescoPiece"("frescoId");

-- AddForeignKey
ALTER TABLE "Showcase" ADD CONSTRAINT "Showcase_frescoId_fkey" FOREIGN KEY ("frescoId") REFERENCES "Fresco"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fresco" ADD CONSTRAINT "Fresco_universeId_fkey" FOREIGN KEY ("universeId") REFERENCES "Universe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fresco" ADD CONSTRAINT "Fresco_pieceLotId_fkey" FOREIGN KEY ("pieceLotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fresco" ADD CONSTRAINT "Fresco_rowLotId_fkey" FOREIGN KEY ("rowLotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fresco" ADD CONSTRAINT "Fresco_columnLotId_fkey" FOREIGN KEY ("columnLotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fresco" ADD CONSTRAINT "Fresco_completeLotId_fkey" FOREIGN KEY ("completeLotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FrescoPiece" ADD CONSTRAINT "FrescoPiece_frescoId_fkey" FOREIGN KEY ("frescoId") REFERENCES "Fresco"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFrescoPiece" ADD CONSTRAINT "UserFrescoPiece_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFrescoPiece" ADD CONSTRAINT "UserFrescoPiece_pieceId_fkey" FOREIGN KEY ("pieceId") REFERENCES "FrescoPiece"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFrescoPiece" ADD CONSTRAINT "UserFrescoPiece_frescoId_fkey" FOREIGN KEY ("frescoId") REFERENCES "Fresco"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FrescoReward" ADD CONSTRAINT "FrescoReward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FrescoReward" ADD CONSTRAINT "FrescoReward_frescoId_fkey" FOREIGN KEY ("frescoId") REFERENCES "Fresco"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Garde-fous : grille raisonnable, poids et positions positifs
ALTER TABLE "Fresco" ADD CONSTRAINT "Fresco_grid_check" CHECK ("cols" BETWEEN 1 AND 8 AND "rows" BETWEEN 1 AND 8);
ALTER TABLE "Fresco" ADD CONSTRAINT "Fresco_dropWeight_check" CHECK ("dropWeight" >= 0);
ALTER TABLE "FrescoPiece" ADD CONSTRAINT "FrescoPiece_position_check" CHECK ("position" >= 0);
ALTER TABLE "FrescoReward" ADD CONSTRAINT "FrescoReward_index_check" CHECK ("index" >= 0);
