-- Ennichi 縁日 (étape 18d) : fête de lancement du parrainage v2. Graine du tirage engagée au lancement, paliers de
-- lanternes atteints (figés) et versés une fois par joueur, classement final du banzuke, prix du banzuke et de
-- l'omikuji versés une fois chacun. Rien ne se passe tant que l'interrupteur ennichi.enabled est coupé.

-- Enums
CREATE TYPE "EnnichiAwardKind" AS ENUM ('BANZUKE', 'OMIKUJI');
ALTER TYPE "CoinReason" ADD VALUE 'ENNICHI';
ALTER TYPE "NotificationType" ADD VALUE 'ENNICHI_REWARD';

-- Édition : graine (secrète jusqu'au tirage), empreinte publiée, contrôle, tirage, tickets et cagnotte figés
CREATE TABLE "EnnichiDraw" (
    "edition" INTEGER NOT NULL,
    "seedHash" CHAR(64) NOT NULL,
    "seed" CHAR(64) NOT NULL,
    "committedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedAt" TIMESTAMP(3),
    "checkedById" TEXT,
    "drawnAt" TIMESTAMP(3),
    "drawnById" TEXT,
    "ticketsHash" CHAR(64),
    "tickets" JSONB,
    "prizes" JSONB,

    CONSTRAINT "EnnichiDraw_pkey" PRIMARY KEY ("edition"),
    CONSTRAINT "EnnichiDraw_edition_check" CHECK ("edition" >= 1),
    CONSTRAINT "EnnichiDraw_hex_check" CHECK ("seed" ~ '^[0-9a-f]{64}$' AND "seedHash" ~ '^[0-9a-f]{64}$'),
    -- Tirage fait : tickets, empreinte et cagnotte figés ensemble
    CONSTRAINT "EnnichiDraw_drawn_check" CHECK (("drawnAt" IS NULL) = ("ticketsHash" IS NULL) AND ("drawnAt" IS NULL) = ("tickets" IS NULL) AND ("drawnAt" IS NULL) = ("prizes" IS NULL))
);

-- Paliers de lanternes atteints : lot et bons figés au moment du palier, avancement de l'envoi
CREATE TABLE "EnnichiTierReached" (
    "edition" INTEGER NOT NULL,
    "tier" INTEGER NOT NULL,
    "lanterns" INTEGER NOT NULL,
    "lotId" TEXT,
    "choiceVouchers" INTEGER NOT NULL DEFAULT 0,
    "reachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "served" INTEGER NOT NULL DEFAULT 0,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "EnnichiTierReached_pkey" PRIMARY KEY ("edition","tier"),
    CONSTRAINT "EnnichiTierReached_tier_check" CHECK ("tier" BETWEEN 0 AND 3 AND "lanterns" >= 1 AND "choiceVouchers" >= 0 AND "served" >= 0)
);

-- Lot d'un palier versé à un joueur, une seule fois (envoi du cron et rattrapage à l'ouverture d'un booster)
CREATE TABLE "EnnichiTierGrant" (
    "id" TEXT NOT NULL,
    "edition" INTEGER NOT NULL,
    "tier" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "ipHash" TEXT,
    "granted" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnnichiTierGrant_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EnnichiTierGrant_granted_check" CHECK (jsonb_typeof("granted") = 'object')
);
CREATE INDEX "EnnichiTierGrant_edition_tier_ipHash_idx" ON "EnnichiTierGrant"("edition", "tier", "ipHash");
CREATE INDEX "EnnichiTierGrant_userId_idx" ON "EnnichiTierGrant"("userId");
CREATE UNIQUE INDEX "EnnichiTierGrant_edition_tier_userId_key" ON "EnnichiTierGrant"("edition", "tier", "userId");
ALTER TABLE "EnnichiTierGrant" ADD CONSTRAINT "EnnichiTierGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Classement final du banzuke (le pseudo reste si le compte est supprimé)
CREATE TABLE "EnnichiResult" (
    "edition" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "reachedAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT,

    CONSTRAINT "EnnichiResult_pkey" PRIMARY KEY ("edition","rank"),
    CONSTRAINT "EnnichiResult_rank_check" CHECK ("rank" >= 1 AND "count" >= 1),
    CONSTRAINT "EnnichiResult_title_check" CHECK ("title" IS NULL OR "title" IN ('yokozuna', 'ozeki', 'sekiwake'))
);
CREATE INDEX "EnnichiResult_userId_idx" ON "EnnichiResult"("userId");
ALTER TABLE "EnnichiResult" ADD CONSTRAINT "EnnichiResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prix du banzuke (par rang) et lots de l'omikuji (par n° de tirage), versés une fois chacun
CREATE TABLE "EnnichiAward" (
    "id" TEXT NOT NULL,
    "edition" INTEGER NOT NULL,
    "kind" "EnnichiAwardKind" NOT NULL,
    "ref" INTEGER NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "prize" JSONB NOT NULL,
    "granted" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnnichiAward_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EnnichiAward_ref_check" CHECK ("ref" >= 1),
    CONSTRAINT "EnnichiAward_json_check" CHECK (jsonb_typeof("prize") = 'object' AND jsonb_typeof("granted") = 'object')
);
CREATE INDEX "EnnichiAward_userId_idx" ON "EnnichiAward"("userId");
CREATE UNIQUE INDEX "EnnichiAward_edition_kind_ref_key" ON "EnnichiAward"("edition", "kind", "ref");
ALTER TABLE "EnnichiAward" ADD CONSTRAINT "EnnichiAward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
