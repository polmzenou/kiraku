-- CreateEnum
CREATE TYPE "TitleAgreement" AS ENUM ('MASC', 'FEM');

-- CreateEnum
CREATE TYPE "CosmeticKind" AS ENUM ('TITLE', 'FRAME');

-- AlterTable
ALTER TABLE "RarityDefinition" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "badgeOrder" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "bio" VARCHAR(160),
ADD COLUMN     "frameId" TEXT,
ADD COLUMN     "titleAgreement" "TitleAgreement" NOT NULL DEFAULT 'MASC',
ADD COLUMN     "titleId" TEXT;

-- CreateTable
CREATE TABLE "Cosmetic" (
    "id" TEXT NOT NULL,
    "kind" "CosmeticKind" NOT NULL,
    "slug" TEXT NOT NULL,
    "label" JSONB NOT NULL,
    "hint" JSONB NOT NULL DEFAULT '{}',
    "frameStyle" TEXT,
    "condition" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cosmetic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cosmetic_slug_key" ON "Cosmetic"("slug");

-- CreateIndex
CREATE INDEX "Cosmetic_kind_active_sortOrder_idx" ON "Cosmetic"("kind", "active", "sortOrder");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Cosmetic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_frameId_fkey" FOREIGN KEY ("frameId") REFERENCES "Cosmetic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
