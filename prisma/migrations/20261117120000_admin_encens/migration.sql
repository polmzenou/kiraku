-- Encens donnés ou retirés depuis l'admin : disponibles = gagnés + incenseBonus − incenseUsed.
-- Le bonus peut être négatif (Encens retirés) ; les disponibles restent bornés à 0 dans le code.
-- La nouvelle valeur d'enum ne sert pas dans cette migration (ALTER TYPE … ADD VALUE).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- AlterEnum
ALTER TYPE "GiftKind" ADD VALUE 'INCENSE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "incenseBonus" INTEGER NOT NULL DEFAULT 0;

COMMIT;
