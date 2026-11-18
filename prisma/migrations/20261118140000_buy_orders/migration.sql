-- Avis de recherche (ordres d'achat) : un joueur bloque le prix (ORDER_HOLD) pour une carte précise, le
-- premier détenteur qui accepte la lui vend (SALE + prix, puis FEE − taxe). Les nouvelles valeurs des
-- enums CoinReason et NotificationType ne servent pas dans ce fichier (ALTER TYPE … ADD VALUE).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- CreateEnum
CREATE TYPE "BuyOrderStatus" AS ENUM ('OPEN', 'FILLED', 'CANCELLED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "CoinReason" ADD VALUE 'ORDER_HOLD';
ALTER TYPE "CoinReason" ADD VALUE 'ORDER_REFUND';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'BUY_ORDER_FILLED';
ALTER TYPE "NotificationType" ADD VALUE 'BUY_ORDER_EXPIRED';
ALTER TYPE "NotificationType" ADD VALUE 'BUY_ORDER_WANTED';

-- CreateTable
CREATE TABLE "BuyOrder" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "feeBp" INTEGER NOT NULL,
    "status" "BuyOrderStatus" NOT NULL DEFAULT 'OPEN',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sellerId" TEXT,
    "userCardId" TEXT,
    "filledAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "fee" INTEGER,

    CONSTRAINT "BuyOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BuyOrder_cardId_status_price_createdAt_idx" ON "BuyOrder"("cardId", "status", "price", "createdAt");

-- CreateIndex
CREATE INDEX "BuyOrder_buyerId_status_idx" ON "BuyOrder"("buyerId", "status");

-- CreateIndex
CREATE INDEX "BuyOrder_status_expiresAt_idx" ON "BuyOrder"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "BuyOrder_status_filledAt_idx" ON "BuyOrder"("status", "filledAt");

-- CreateIndex
CREATE INDEX "BuyOrder_sellerId_idx" ON "BuyOrder"("sellerId");

-- CreateIndex
CREATE INDEX "BuyOrder_userCardId_idx" ON "BuyOrder"("userCardId");

-- AddForeignKey
ALTER TABLE "BuyOrder" ADD CONSTRAINT "BuyOrder_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyOrder" ADD CONSTRAINT "BuyOrder_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyOrder" ADD CONSTRAINT "BuyOrder_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyOrder" ADD CONSTRAINT "BuyOrder_userCardId_fkey" FOREIGN KEY ("userCardId") REFERENCES "UserCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prix strictement positif, taxe et montants jamais négatifs ; un avis rempli porte sa date et sa taxe
ALTER TABLE "BuyOrder" ADD CONSTRAINT "BuyOrder_amounts" CHECK ("price" > 0 AND "feeBp" >= 0 AND ("fee" IS NULL OR "fee" >= 0));
ALTER TABLE "BuyOrder" ADD CONSTRAINT "BuyOrder_filled" CHECK ("status" <> 'FILLED' OR ("filledAt" IS NOT NULL AND "fee" IS NOT NULL));

COMMIT;
