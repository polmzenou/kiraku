-- Créations originales (origin CUSTOM) incluses d'office dans les boosters dont elles passent le filtre,
-- comme les cartes AniList : plus besoin de cocher chaque booster sur chaque carte. Les sachets scellés
-- (DROP) et les exclusifs boutique (PRESTIGE) gardent la sélection manuelle. updatedAt touché : le pool
-- de chaque type devient périmé (lib/boosters/pool-freshness.ts) et se recalcule au prochain passage.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- AlterTable
ALTER TABLE "BoosterType" ADD COLUMN "includeCustom" BOOLEAN NOT NULL DEFAULT true;

UPDATE "BoosterType" SET "includeCustom" = false WHERE "kind" IN ('DROP', 'PRESTIGE');
UPDATE "BoosterType" SET "updatedAt" = CURRENT_TIMESTAMP;

COMMIT;
