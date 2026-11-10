-- AlterTable : carte spoil (personnage ou transformation qui dévoile l'histoire), illustration floutée pour les joueurs en mode spoiler
ALTER TABLE "Card" ADD COLUMN "spoiler" BOOLEAN NOT NULL DEFAULT false;
