-- Exclusion du classement des collectionneurs, posée par l'admin
ALTER TABLE "User" ADD COLUMN "leaderboardHiddenAt" TIMESTAMP(3);
