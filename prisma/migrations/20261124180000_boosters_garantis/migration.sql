-- Boosters garantis : un par rareté de variante, jamais proposés ni vendus, donnés depuis l'admin
ALTER TYPE "BoosterKind" ADD VALUE 'GUARANTEED';

-- Rareté servie à coup sûr sur la dernière carte d'un booster garanti (clé de RarityDefinition)
ALTER TABLE "BoosterType" ADD COLUMN "guaranteed" TEXT;
