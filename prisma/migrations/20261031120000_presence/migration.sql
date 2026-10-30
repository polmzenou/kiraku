-- Présence en ligne : dernière activité et hors ligne choisi (ADMIN/DEV)
ALTER TABLE "User" ADD COLUMN "lastSeenAt" TIMESTAMP(3),
ADD COLUMN "appearOffline" BOOLEAN NOT NULL DEFAULT false;
