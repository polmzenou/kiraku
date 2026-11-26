-- Discord : création d'annonce envoyée sans issue connue (réseau, 5xx, réponse perdue). Seule une telle tentative est
-- suivie d'une reprise (recherche du message du bot portant le repère de la clé) ; un 429 ou un autre 4xx n'en déclenche
-- plus. Nul pour les lignes existantes : leurs messages d'avant ce repère ne seraient de toute façon pas retrouvés.

-- AlterTable
ALTER TABLE "DiscordPost" ADD COLUMN     "sendStartedAt" TIMESTAMP(3);
