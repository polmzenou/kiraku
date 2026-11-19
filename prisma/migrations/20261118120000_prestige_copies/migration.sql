-- Prestige, lot 16a : exemplaires distincts. Héritage, tirage et numéro sont portés par l'exemplaire
-- (UserCard) et le suivent quand il change de main ; la provenance des exemplaires spéciaux est
-- journalisée ; un échange en attente peut désigner un exemplaire précis.
-- Les colonnes ont une valeur par défaut constante : la table UserCard n'est pas réécrite.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Exemplaire spécial = héritier (heritage > 0) ou gravé (printing renseigné)
ALTER TABLE "UserCard"
  ADD COLUMN "heritage" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "keptByOwner" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "printing" INTEGER,
  ADD COLUMN "serial" INTEGER;

-- Cinq marques d'héritage au plus ; seul un exemplaire héritier a été gardé par son propriétaire
ALTER TABLE "UserCard" ADD CONSTRAINT "UserCard_heritage_check" CHECK (
  "heritage" BETWEEN 0 AND 5 AND "keptByOwner" >= 0 AND ("keptByOwner" = 0 OR "heritage" > 0)
);
-- Tirage et numéro vont ensemble, à partir de 1
ALTER TABLE "UserCard" ADD CONSTRAINT "UserCard_engraving_check" CHECK (
  ("printing" IS NULL) = ("serial" IS NULL) AND ("printing" IS NULL OR ("printing" >= 1 AND "serial" >= 1))
);

-- Un numéro n'existe qu'une fois par carte et par tirage. Index partiel : les exemplaires ordinaires
-- (presque toute la table) n'y figurent pas.
CREATE UNIQUE INDEX "UserCard_engraved_key" ON "UserCard"("cardId", "printing", "serial") WHERE "printing" IS NOT NULL;
-- Exemplaires spéciaux d'un joueur (fiche carte, choix d'un exemplaire, filtres de la collection)
CREATE INDEX "UserCard_owner_special_idx" ON "UserCard"("ownerId", "cardId") WHERE "heritage" > 0 OR "printing" IS NOT NULL;

-- Filet de sécurité : « gardée par son propriétaire » repart de zéro dès que le propriétaire change,
-- même si une écriture oubliait de passer par moveCopy (server/collection/transfer.ts).
CREATE FUNCTION usercard_reset_kept() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."ownerId" IS DISTINCT FROM OLD."ownerId" THEN
    NEW."keptByOwner" := 0;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER usercard_reset_kept BEFORE UPDATE OF "ownerId" ON "UserCard" FOR EACH ROW EXECUTE FUNCTION usercard_reset_kept();

-- Provenance d'un exemplaire spécial : un propriétaire par ligne, dans l'ordre
CREATE TYPE "OwnershipVia" AS ENUM ('DRAW', 'REBIRTH', 'AUCTION', 'LISTING', 'TRADE', 'GIFT', 'CASINO');

CREATE TABLE "UserCardOwner" (
    "id" TEXT NOT NULL,
    "userCardId" TEXT NOT NULL,
    "ownerId" TEXT,
    "via" "OwnershipVia" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCardOwner_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "UserCardOwner_userCardId_at_idx" ON "UserCardOwner"("userCardId", "at");
-- Suppression d'un compte : ses lignes de provenance passent à « joueur supprimé » (SET NULL)
CREATE INDEX "UserCardOwner_ownerId_idx" ON "UserCardOwner"("ownerId");
-- Exemplaire recyclé : sa provenance s'efface avec lui
ALTER TABLE "UserCardOwner" ADD CONSTRAINT "UserCardOwner_userCardId_fkey" FOREIGN KEY ("userCardId") REFERENCES "UserCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserCardOwner" ADD CONSTRAINT "UserCardOwner_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Exemplaire désigné pendant l'attente d'un échange. Sans clé étrangère, comme Gift.userCardId : la
-- suppression en masse d'une renaissance n'a pas à parcourir ces tables ; revérifié sous verrou à l'acceptation.
ALTER TABLE "TradeListing" ADD COLUMN "userCardId" TEXT;
ALTER TABLE "ListingOffer" ADD COLUMN "userCardId" TEXT;
ALTER TABLE "TradeOffer" ADD COLUMN "userCardId" TEXT;
ALTER TABLE "Trade" ADD COLUMN "userCardId" TEXT;
COMMIT;
