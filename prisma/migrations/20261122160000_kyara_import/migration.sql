-- Import Kyara (étape 17) : demandes d'import de la collection Kyara d'un joueur, date d'inscription des comptes
-- (départ de la fenêtre d'un compte inscrit après la sortie), découvertes importées (hors missions et Wrapped),
-- motif de Zeni et notifications.

-- AlterEnum
ALTER TYPE "CoinReason" ADD VALUE 'KYARA_IMPORT';
ALTER TYPE "NotificationType" ADD VALUE 'KYARA_IMPORT_DONE';
ALTER TYPE "NotificationType" ADD VALUE 'KYARA_IMPORT_REJECTED';

-- CreateEnum
CREATE TYPE "KyaraImportStatus" AS ENUM ('PENDING', 'READY', 'DONE', 'REJECTED', 'CANCELLED');

-- AlterTable : le compte devient réel (inscription e-mail ou liaison Discord) quand isGuest passe à false. Le
-- trigger couvre tous les chemins (createPlayer, montée d'un invité, adaptateur Auth.js) et ne réécrit jamais la date.
ALTER TABLE "User" ADD COLUMN "registeredAt" TIMESTAMP(3);
UPDATE "User" SET "registeredAt" = COALESCE("discordLinkedAt", "createdAt") WHERE NOT "isGuest";

CREATE FUNCTION user_registered_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT NEW."isGuest" AND NEW."registeredAt" IS NULL THEN
    NEW."registeredAt" := CURRENT_TIMESTAMP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_registered_at BEFORE INSERT OR UPDATE OF "isGuest" ON "User"
  FOR EACH ROW EXECUTE FUNCTION user_registered_at();

-- AlterTable : découverte venue de l'import (ni mission « découvrir des cartes » ni Wrapped)
ALTER TABLE "Discovery" ADD COLUMN "imported" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "KyaraImport" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "discordId" VARCHAR(25) NOT NULL,
    "kyaraUserId" VARCHAR(36) NOT NULL,
    "status" "KyaraImportStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineAt" TIMESTAMP(3),
    "nonceHash" VARCHAR(64),
    "nonceById" TEXT,
    "nonceExpiresAt" TIMESTAMP(3),
    "kyaraUsername" VARCHAR(64),
    "kyaraAvatarUrl" VARCHAR(500),
    "kyaraDiscordId" VARCHAR(25),
    "discordVerified" BOOLEAN,
    "snapshot" JSONB,
    "snapshotCards" INTEGER,
    "snapshotCopies" INTEGER,
    "snapshotTotal" INTEGER,
    "bookmarkletBuild" INTEGER,
    "readAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "receivedById" TEXT,
    "grantedCards" INTEGER,
    "grantedZeni" INTEGER,
    "zeniRaw" INTEGER,
    "summary" JSONB,
    "appliedAt" TIMESTAMP(3),
    "appliedById" TEXT,
    "rejectCode" VARCHAR(24),
    "rejectNote" VARCHAR(300),
    "rejectedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "reopenCount" INTEGER NOT NULL DEFAULT 0,
    "closedAt" TIMESTAMP(3),
    "purgedAt" TIMESTAMP(3),

    CONSTRAINT "KyaraImport_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "KyaraImport_ids_check" CHECK (
        "kyaraUserId" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND "discordId" ~ '^[0-9]{5,25}$'
    ),
    -- Un lien de traitement a toujours une expiration, et inversement
    CONSTRAINT "KyaraImport_nonce_check" CHECK (("nonceHash" IS NULL) = ("nonceExpiresAt" IS NULL)),
    -- READY : une collection lue ; DONE : un versement complet
    CONSTRAINT "KyaraImport_ready_check" CHECK ("status" <> 'READY' OR ("snapshot" IS NOT NULL AND "receivedAt" IS NOT NULL)),
    CONSTRAINT "KyaraImport_done_check" CHECK (
        "status" <> 'DONE' OR ("appliedAt" IS NOT NULL AND "grantedCards" >= 0 AND "grantedZeni" >= 0 AND "zeniRaw" >= "grantedZeni")
    ),
    CONSTRAINT "KyaraImport_reopen_check" CHECK ("reopenCount" >= 0)
);

-- CreateIndex : une demande en cours ou versée par compte et par compte Discord ; un profil Kyara lu ou versé une
-- seule fois (pas dès la demande : une adresse publique collée par un autre ne bloque pas le vrai propriétaire)
CREATE UNIQUE INDEX "KyaraImport_userId_once" ON "KyaraImport"("userId") WHERE "status" IN ('PENDING', 'READY', 'DONE');
CREATE UNIQUE INDEX "KyaraImport_discordId_once" ON "KyaraImport"("discordId") WHERE "status" IN ('PENDING', 'READY', 'DONE');
CREATE UNIQUE INDEX "KyaraImport_kyaraUserId_once" ON "KyaraImport"("kyaraUserId") WHERE "status" IN ('READY', 'DONE');

-- CreateIndex
CREATE UNIQUE INDEX "KyaraImport_nonceHash_key" ON "KyaraImport"("nonceHash");
CREATE INDEX "KyaraImport_status_requestedAt_idx" ON "KyaraImport"("status", "requestedAt");
CREATE INDEX "KyaraImport_userId_idx" ON "KyaraImport"("userId");
CREATE INDEX "KyaraImport_kyaraUserId_idx" ON "KyaraImport"("kyaraUserId");
CREATE INDEX "KyaraImport_closedAt_idx" ON "KyaraImport"("closedAt");

-- AddForeignKey : le verrou survit à la suppression du compte (ids Discord et Kyara gardés)
ALTER TABLE "KyaraImport" ADD CONSTRAINT "KyaraImport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
