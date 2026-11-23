-- Import Kyara simplifié : le joueur ne colle plus l'adresse de son profil (l'équipe la lit sur Kyara), plus de lien
-- de traitement par demande ; chaque membre de l'équipe a la clé de son favori, et une lecture douteuse attend
-- l'équipe (reviewReason).

-- Liens de traitement retirés
ALTER TABLE "KyaraImport" DROP CONSTRAINT "KyaraImport_nonce_check";
DROP INDEX "KyaraImport_nonceHash_key";
ALTER TABLE "KyaraImport" DROP COLUMN "nonceHash", DROP COLUMN "nonceById", DROP COLUMN "nonceExpiresAt";

-- Profil Kyara connu à la lecture seulement
ALTER TABLE "KyaraImport" ALTER COLUMN "kyaraUserId" DROP NOT NULL;
ALTER TABLE "KyaraImport" DROP CONSTRAINT "KyaraImport_ids_check";
ALTER TABLE "KyaraImport" ADD CONSTRAINT "KyaraImport_ids_check" CHECK (
    ("kyaraUserId" IS NULL OR "kyaraUserId" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    AND "discordId" ~ '^[0-9]{5,25}$'
);
ALTER TABLE "KyaraImport" ADD CONSTRAINT "KyaraImport_read_check" CHECK ("status" NOT IN ('READY', 'DONE') OR "kyaraUserId" IS NOT NULL);

-- Lecture laissée à l'équipe : avatar sans ID Discord, lecture incomplète
ALTER TABLE "KyaraImport" ADD COLUMN "reviewReason" VARCHAR(24);

-- CreateTable
CREATE TABLE "KyaraStaffKey" (
    "userId" TEXT NOT NULL,
    "keyHash" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KyaraStaffKey_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "KyaraStaffKey_keyHash_key" ON "KyaraStaffKey"("keyHash");

-- AddForeignKey
ALTER TABLE "KyaraStaffKey" ADD CONSTRAINT "KyaraStaffKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
