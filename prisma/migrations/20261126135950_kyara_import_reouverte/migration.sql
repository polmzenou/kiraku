-- Import Kyara : le joueur est prévenu quand l'équipe annule le refus de sa demande (elle attend de nouveau).

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'KYARA_IMPORT_REOPENED';
