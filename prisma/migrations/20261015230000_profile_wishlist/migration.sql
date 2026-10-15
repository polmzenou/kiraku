CREATE TABLE "WishlistEntry" (
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WishlistEntry_pkey" PRIMARY KEY ("userId", "cardId"),
    CONSTRAINT "WishlistEntry_position_check" CHECK ("position" BETWEEN 1 AND 20)
);

CREATE UNIQUE INDEX "WishlistEntry_userId_position_key" ON "WishlistEntry"("userId", "position");
CREATE INDEX "WishlistEntry_cardId_idx" ON "WishlistEntry"("cardId");
ALTER TABLE "WishlistEntry" ADD CONSTRAINT "WishlistEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WishlistEntry" ADD CONSTRAINT "WishlistEntry_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
