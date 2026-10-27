-- AlterTable : une variante suit sa carte de base dans les boosters, sauf si elle est exclusive
ALTER TABLE "Card" ADD COLUMN "boosterExclusive" BOOLEAN NOT NULL DEFAULT false;
