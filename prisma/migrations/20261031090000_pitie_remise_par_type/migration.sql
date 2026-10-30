-- Une Mythique tombée dans un type remet la pitié partagée à zéro, sauf pour les types qui la font
-- seulement avancer : l'Impérial (taux Légendaire et mieux ×2,7) ne la remet plus, seule la Mythique
-- garantie le fait.

-- AlterTable
ALTER TABLE "BoosterType" ADD COLUMN     "resetsPity" BOOLEAN NOT NULL DEFAULT true;

-- Impérial
UPDATE "BoosterType" SET "resetsPity" = false WHERE "slug" = 'imperial';
