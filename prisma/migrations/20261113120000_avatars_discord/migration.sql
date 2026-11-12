-- AlterTable : dernière relecture de l'avatar Discord d'un joueur lié (synchro légère par le cron Discord)
ALTER TABLE "User" ADD COLUMN "avatarCheckedAt" TIMESTAMP(3);
