-- Succès (honorifiques) : déblocages par joueur et succès mis en avant sous l'avatar.
-- Le catalogue vit dans le code (lib/achievements/catalog.ts) : la clé n'a pas de clé étrangère.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "featuredAchievement" VARCHAR(40);

-- CreateTable
CREATE TABLE "UserAchievement" (
    "userId" TEXT NOT NULL,
    "key" VARCHAR(40) NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAchievement_pkey" PRIMARY KEY ("userId","key")
);

-- CreateIndex
CREATE INDEX "UserAchievement_key_idx" ON "UserAchievement"("key");

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
