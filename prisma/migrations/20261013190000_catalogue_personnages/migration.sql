-- Recherche du wiki : index trigramme sur Card.searchText (extension fournie par Neon)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "Rarity" AS ENUM ('COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC');

-- CreateEnum
CREATE TYPE "CatalogImportStatus" AS ENUM ('RUNNING', 'FINALIZED', 'ABANDONED', 'FAILED');

-- CreateTable
CREATE TABLE "Series" (
    "id" TEXT NOT NULL,
    "anilistId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "titleRomaji" TEXT NOT NULL,
    "titleEnglish" TEXT,
    "titleNative" TEXT,
    "isAdult" BOOLEAN NOT NULL DEFAULT false,
    "genres" TEXT[],
    "tags" TEXT[],
    "year" INTEGER,
    "season" TEXT,
    "seasonYear" INTEGER,
    "studio" TEXT,

    CONSTRAINT "Series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "anilistId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "nameNative" TEXT,
    "imageUrl" TEXT NOT NULL,
    "favorites" INTEGER NOT NULL,
    "rank" INTEGER,
    "rarity" "Rarity" NOT NULL,
    "power" INTEGER NOT NULL,
    "ki" INTEGER NOT NULL,
    "seriesId" TEXT NOT NULL,
    "gender" TEXT,
    "birthMonth" INTEGER,
    "birthDay" INTEGER,
    "role" TEXT,
    "searchText" TEXT NOT NULL,
    "addedImportId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogImport" (
    "id" TEXT NOT NULL,
    "status" "CatalogImportStatus" NOT NULL DEFAULT 'RUNNING',
    "target" INTEGER NOT NULL,
    "lastPage" INTEGER NOT NULL DEFAULT 0,
    "kept" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "CatalogImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogImportRow" (
    "importId" TEXT NOT NULL,
    "anilistId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "favorites" INTEGER NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "CatalogImportRow_pkey" PRIMARY KEY ("importId","anilistId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Series_anilistId_key" ON "Series"("anilistId");

-- CreateIndex
CREATE UNIQUE INDEX "Card_anilistId_key" ON "Card"("anilistId");

-- CreateIndex
CREATE UNIQUE INDEX "Card_rank_key" ON "Card"("rank");

-- CreateIndex
CREATE INDEX "Card_rarity_rank_idx" ON "Card"("rarity", "rank");

-- CreateIndex
CREATE INDEX "Card_seriesId_idx" ON "Card"("seriesId");

-- CreateIndex
CREATE INDEX "Card_searchText_idx" ON "Card" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "CatalogImport_status_startedAt_idx" ON "CatalogImport"("status", "startedAt");

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogImportRow" ADD CONSTRAINT "CatalogImportRow_importId_fkey" FOREIGN KEY ("importId") REFERENCES "CatalogImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

