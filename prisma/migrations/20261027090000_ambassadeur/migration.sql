-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'AMBASSADOR_GRANTED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "ambassadorSince" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AmbassadorPackClaim" (
    "userId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "boosterTypeId" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AmbassadorPackClaim_pkey" PRIMARY KEY ("userId","periodKey")
);

-- CreateIndex
CREATE INDEX "User_ambassadorSince_idx" ON "User"("ambassadorSince");

-- AddForeignKey
ALTER TABLE "AmbassadorPackClaim" ADD CONSTRAINT "AmbassadorPackClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- L'ancien badge de parrainage « Ambassadeur » devient « Parrain » : l'ordre choisi par les joueurs
-- suit le nouveau nom, et le seuil de filleuls change de clé (une valeur réglée à la main est gardée)
UPDATE "User" SET "badgeOrder" = array_replace("badgeOrder", 'AMBASSADOR', 'SPONSOR')
WHERE 'AMBASSADOR' = ANY("badgeOrder");

UPDATE "GameSetting" SET "key" = 'profile.sponsorReferrals', "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'profile.ambassadorReferrals';
