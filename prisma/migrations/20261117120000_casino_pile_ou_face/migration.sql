-- Casino : pile ou face (表 / 裏). Les valeurs ajoutées aux enums existants (CardStatus, NotificationType)
-- ne servent pas dans ce fichier : Postgres refuse d'employer une valeur ajoutée dans la même transaction.

-- Exemplaire misé sur une table ouverte : séquestre, hors de tous les transferts (qui filtrent COLLECTION)
ALTER TYPE "CardStatus" ADD VALUE 'CASINO';

ALTER TYPE "NotificationType" ADD VALUE 'COINFLIP_INVITE';
ALTER TYPE "NotificationType" ADD VALUE 'COINFLIP_RESOLVED';
ALTER TYPE "NotificationType" ADD VALUE 'COINFLIP_RETURNED';

CREATE TYPE "CoinSide" AS ENUM ('OMOTE', 'URA');
CREATE TYPE "CoinFlipStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED', 'EXPIRED');

CREATE TABLE "CoinFlip" (
    "id" TEXT NOT NULL,
    "status" "CoinFlipStatus" NOT NULL DEFAULT 'OPEN',
    "creatorId" TEXT NOT NULL,
    "creatorUserCardId" TEXT NOT NULL,
    "creatorCardId" TEXT NOT NULL,
    "creatorRarity" TEXT NOT NULL,
    "creatorSide" "CoinSide" NOT NULL,
    "tierOrder" INTEGER NOT NULL,
    "reservedForId" TEXT,
    "opponentId" TEXT,
    "opponentUserCardId" TEXT,
    "opponentCardId" TEXT,
    "opponentRarity" TEXT,
    "seed" CHAR(64) NOT NULL,
    "seedHash" CHAR(64) NOT NULL,
    "result" "CoinSide",
    "winnerId" TEXT,
    "winnerNew" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "creatorSeenAt" TIMESTAMP(3),

    CONSTRAINT "CoinFlip_pkey" PRIMARY KEY ("id"),
    -- Graine et empreinte en hexadécimal minuscule (32 octets)
    CONSTRAINT "CoinFlip_seed_hex" CHECK ("seed" ~ '^[0-9a-f]{64}$' AND "seedHash" ~ '^[0-9a-f]{64}$'),
    -- On ne joue pas contre soi-même, on ne se réserve pas sa propre table
    CONSTRAINT "CoinFlip_not_self" CHECK ("opponentId" IS NULL OR "opponentId" <> "creatorId"),
    CONSTRAINT "CoinFlip_not_reserved_self" CHECK ("reservedForId" IS NULL OR "reservedForId" <> "creatorId"),
    -- Forme de la ligne selon le statut : ouverte sans adversaire ni issue ; jouée complète ; retirée ou expirée datée, sans issue
    CONSTRAINT "CoinFlip_status_shape" CHECK (
        CASE "status"
            WHEN 'OPEN' THEN num_nonnulls("opponentId", "opponentUserCardId", "opponentCardId", "opponentRarity", "result", "winnerId", "resolvedAt") = 0
            WHEN 'DONE' THEN num_nulls("opponentId", "opponentUserCardId", "opponentCardId", "opponentRarity", "result", "winnerId", "resolvedAt") = 0
            ELSE num_nonnulls("opponentId", "opponentUserCardId", "opponentCardId", "opponentRarity", "result", "winnerId") = 0 AND "resolvedAt" IS NOT NULL
        END
    ),
    -- Le gagnant est le créateur si la pièce tombe sur sa face, sinon l'adversaire
    CONSTRAINT "CoinFlip_winner" CHECK (
        "status" <> 'DONE' OR "winnerId" = CASE WHEN "result" = "creatorSide" THEN "creatorId" ELSE "opponentId" END
    )
);

-- Un exemplaire ne se mise que sur une table ouverte à la fois
CREATE UNIQUE INDEX "CoinFlip_open_stake_key" ON "CoinFlip"("creatorUserCardId") WHERE "status" = 'OPEN';

CREATE INDEX "CoinFlip_status_tierOrder_createdAt_idx" ON "CoinFlip"("status", "tierOrder", "createdAt");
CREATE INDEX "CoinFlip_status_expiresAt_idx" ON "CoinFlip"("status", "expiresAt");
CREATE INDEX "CoinFlip_status_resolvedAt_idx" ON "CoinFlip"("status", "resolvedAt");
CREATE INDEX "CoinFlip_creatorId_createdAt_idx" ON "CoinFlip"("creatorId", "createdAt");
CREATE INDEX "CoinFlip_opponentId_resolvedAt_idx" ON "CoinFlip"("opponentId", "resolvedAt");
CREATE INDEX "CoinFlip_reservedForId_status_idx" ON "CoinFlip"("reservedForId", "status");
CREATE INDEX "CoinFlip_creatorCardId_idx" ON "CoinFlip"("creatorCardId");
CREATE INDEX "CoinFlip_opponentCardId_idx" ON "CoinFlip"("opponentCardId");

ALTER TABLE "CoinFlip" ADD CONSTRAINT "CoinFlip_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoinFlip" ADD CONSTRAINT "CoinFlip_creatorCardId_fkey" FOREIGN KEY ("creatorCardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoinFlip" ADD CONSTRAINT "CoinFlip_reservedForId_fkey" FOREIGN KEY ("reservedForId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CoinFlip" ADD CONSTRAINT "CoinFlip_opponentId_fkey" FOREIGN KEY ("opponentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoinFlip" ADD CONSTRAINT "CoinFlip_opponentCardId_fkey" FOREIGN KEY ("opponentCardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Relais Discord d'un gros lancer : une publication par table, supprimée avec elle
ALTER TABLE "DiscordPost" ADD COLUMN "coinFlipId" TEXT;
CREATE UNIQUE INDEX "DiscordPost_coinFlipId_key" ON "DiscordPost"("coinFlipId");
ALTER TABLE "DiscordPost" ADD CONSTRAINT "DiscordPost_coinFlipId_fkey"
    FOREIGN KEY ("coinFlipId") REFERENCES "CoinFlip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscordPost" DROP CONSTRAINT "DiscordPost_single_source";
ALTER TABLE "DiscordPost" ADD CONSTRAINT "DiscordPost_single_source"
    CHECK (num_nonnulls("auctionId", "listingId", "seasonId", "coinFlipId") <= 1);
