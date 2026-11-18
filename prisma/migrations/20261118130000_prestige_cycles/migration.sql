-- Prestige, lot 16b : renaissance. Prestige du joueur, cycles (photo des héritières, meilleur score du cycle),
-- retrouvailles d'une carte dans le cycle en cours. La nouvelle valeur de CoinReason ne sert pas dans ce fichier
-- (Postgres refuse d'employer une valeur ajoutée dans la même transaction).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Zeni versés à une renaissance (refId = id du PrestigeCycle)
ALTER TYPE "CoinReason" ADD VALUE 'REBIRTH';

ALTER TABLE "User"
  ADD COLUMN "prestige" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "prestigedAt" TIMESTAMP(3);
-- Un prestige ne redescend jamais ; il est nul exactement tant qu'aucune renaissance n'a eu lieu
ALTER TABLE "User" ADD CONSTRAINT "User_prestige_check" CHECK ("prestige" >= 0 AND ("prestige" = 0) = ("prestigedAt" IS NULL));

CREATE TABLE "PrestigeCycle" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "globalRank" INTEGER NOT NULL,
    "uniqueCards" INTEGER NOT NULL,
    "zeni" INTEGER NOT NULL,
    "heirs" JSONB NOT NULL,
    "stats" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrestigeCycle_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PrestigeCycle_bounds" CHECK ("number" >= 1 AND "globalRank" >= 1 AND "uniqueCards" >= 0 AND "zeni" >= 0)
);
-- Une renaissance par prestige atteint ; un rang global par renaissance (pris sous verrou consultatif)
CREATE UNIQUE INDEX "PrestigeCycle_userId_number_key" ON "PrestigeCycle"("userId", "number");
CREATE UNIQUE INDEX "PrestigeCycle_globalRank_key" ON "PrestigeCycle"("globalRank");
CREATE INDEX "PrestigeCycle_createdAt_idx" ON "PrestigeCycle"("createdAt");
ALTER TABLE "PrestigeCycle" ADD CONSTRAINT "PrestigeCycle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Première obtention de la carte dans le cycle en cours (joueur au prestige 1 ou plus) : tampon « Retrouvée »
-- et mission « découvrir des cartes ». Remis à zéro à chaque renaissance.
ALTER TABLE "Discovery" ADD COLUMN "regainedAt" TIMESTAMP(3);
CREATE INDEX "Discovery_userId_regainedAt_idx" ON "Discovery"("userId", "regainedAt");
COMMIT;
