-- Atelier : capacités achetées par personnage (jamais remboursées) et kit choisi par le joueur.
-- AlterEnum
ALTER TYPE "CoinReason" ADD VALUE 'ABILITY';

-- CreateTable
CREATE TABLE "AbilityPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ability" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AbilityPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardLoadout" (
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "keywords" TEXT[],
    "technique" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardLoadout_pkey" PRIMARY KEY ("userId","cardId")
);

-- CreateIndex
CREATE UNIQUE INDEX "AbilityPurchase_userId_cardId_kind_ability_key" ON "AbilityPurchase"("userId", "cardId", "kind", "ability");

-- CreateIndex
CREATE INDEX "AbilityPurchase_cardId_idx" ON "AbilityPurchase"("cardId");

-- CreateIndex
CREATE INDEX "AbilityPurchase_createdAt_idx" ON "AbilityPurchase"("createdAt");

-- CreateIndex
CREATE INDEX "CardLoadout_cardId_idx" ON "CardLoadout"("cardId");

-- AddForeignKey
ALTER TABLE "AbilityPurchase" ADD CONSTRAINT "AbilityPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbilityPurchase" ADD CONSTRAINT "AbilityPurchase_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardLoadout" ADD CONSTRAINT "CardLoadout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardLoadout" ADD CONSTRAINT "CardLoadout_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Un prix payé est toujours positif
ALTER TABLE "AbilityPurchase" ADD CONSTRAINT "AbilityPurchase_price_positive" CHECK ("price" > 0);
