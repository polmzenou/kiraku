-- Prestige, lot 16d : sanctuaire. Une héritière au plafond, gardée par son propriétaire, peut être consacrée : elle
-- quitte UserCard pour ConsecratedCard (même id), avec son parcours figé. N'étant plus possédée, aucune requête de
-- collection, de marché, de classement ou de complétion n'a à la filtrer.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE "ConsecratedCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "heritage" INTEGER NOT NULL,
    "printing" INTEGER,
    "serial" INTEGER,
    "size" INTEGER,
    "journey" JSONB NOT NULL,
    "consecratedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsecratedCard_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ConsecratedCard_check" CHECK (
      "heritage" BETWEEN 1 AND 5
      AND ("printing" IS NULL) = ("serial" IS NULL)
      AND ("printing" IS NULL OR ("printing" >= 1 AND "serial" >= 1))
    )
);
-- Une gravée consacrée garde son numéro pour toujours : il ne peut exister qu'une fois
CREATE UNIQUE INDEX "ConsecratedCard_engraved_key" ON "ConsecratedCard"("cardId", "printing", "serial") WHERE "printing" IS NOT NULL;
CREATE INDEX "ConsecratedCard_userId_consecratedAt_idx" ON "ConsecratedCard"("userId", "consecratedAt");
CREATE INDEX "ConsecratedCard_cardId_idx" ON "ConsecratedCard"("cardId");
-- Compte supprimé : son sanctuaire part avec lui ; une carte consacrée ne peut plus être retirée du catalogue
ALTER TABLE "ConsecratedCard" ADD CONSTRAINT "ConsecratedCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsecratedCard" ADD CONSTRAINT "ConsecratedCard_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
