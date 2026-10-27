-- Booster exclusif boutique (Impérial) : absent des pages de boosters, doré gardé depuis un crédit
ALTER TYPE "BoosterKind" ADD VALUE 'PRESTIGE';

-- Boost de rareté d'un type : parts des raretés ≥ rateBoostFrom multipliées par rateBoost / 10 000
ALTER TABLE "BoosterType" ADD COLUMN "rateBoost" INTEGER NOT NULL DEFAULT 10000;
ALTER TABLE "BoosterType" ADD COLUMN "rateBoostFrom" TEXT;
