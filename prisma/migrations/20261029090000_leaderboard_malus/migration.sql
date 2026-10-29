-- Malus de cartes uniques dans le classement des collectionneurs, posé par l'admin
ALTER TABLE "User" ADD COLUMN "leaderboardMalus" INTEGER NOT NULL DEFAULT 0;

-- Tristren revient dans le classement avec 750 cartes de moins
UPDATE "User" SET "leaderboardHiddenAt" = NULL, "leaderboardMalus" = 750 WHERE "id" = 'cmvp5zz8m000008le0g19dkap';
