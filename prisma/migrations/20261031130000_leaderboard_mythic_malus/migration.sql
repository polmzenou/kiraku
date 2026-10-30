-- Malus de Mythiques uniques dans le classement des collectionneurs, posé par l'admin
ALTER TABLE "User" ADD COLUMN "leaderboardMythicMalus" INTEGER NOT NULL DEFAULT 0;
