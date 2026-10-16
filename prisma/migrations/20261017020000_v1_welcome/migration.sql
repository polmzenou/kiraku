-- NULL pour les comptes existants et à venir : chacun découvre la v1 une seule fois.
ALTER TABLE "User" ADD COLUMN "v1WelcomeSeenAt" TIMESTAMP(3);
