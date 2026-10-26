-- Modération : un joueur peut être retiré du carrousel des gros tirages jusqu'à une date
ALTER TABLE "User" ADD COLUMN "pullFeedHiddenUntil" TIMESTAMP(3);
