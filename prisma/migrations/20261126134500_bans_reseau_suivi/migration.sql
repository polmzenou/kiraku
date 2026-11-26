-- Bans réseau : appareils distincts bloqués par un ban d'IP, exemptions du suivi d'un appareil, expiration possible
-- d'un ban d'IPv4 posé par l'admin (multiAccount.ipv4BanDays, 0 par défaut : rien ne change).

-- AlterTable
ALTER TABLE "NetworkBan" ADD COLUMN     "deviceTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "liftedAt" TIMESTAMP(3);

-- Seul un ban automatique suit un appareil ou se lève en gardant sa ligne (exemption) ; un ban posé par l'admin
-- n'expire que sur une IP (multiAccount.ipv4BanDays ne vise que les IPv4), jamais sur un appareil
ALTER TABLE "NetworkBan" DROP CONSTRAINT "NetworkBan_auto_check";
ALTER TABLE "NetworkBan" ADD CONSTRAINT "NetworkBan_auto_check"
    CHECK ("source" = 'AUTO' OR ("parentId" IS NULL AND "liftedAt" IS NULL AND ("expiresAt" IS NULL OR "kind" = 'IP')));
