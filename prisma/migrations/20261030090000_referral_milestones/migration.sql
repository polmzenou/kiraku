-- Paliers de parrainage : un lot réclamé une seule fois par seuil d'amis qualifiés et par parrain
CREATE TABLE "ReferralMilestoneClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "referrals" INTEGER NOT NULL,
    "lotId" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralMilestoneClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferralMilestoneClaim_userId_referrals_key" ON "ReferralMilestoneClaim"("userId", "referrals");

-- AddForeignKey
ALTER TABLE "ReferralMilestoneClaim" ADD CONSTRAINT "ReferralMilestoneClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
