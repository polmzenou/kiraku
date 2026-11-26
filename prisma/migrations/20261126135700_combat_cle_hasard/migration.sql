-- Combat : le hasard d'une nouvelle partie vient d'une clé secrète de 32 octets (rngKey, hexadécimal minuscule), tirée
-- au lancement ; chaque action tire ses nombres de HMAC-SHA256(clé, « action:n° »), le bot à part (« bot:n° »). La clé
-- reste en base, jamais envoyée au navigateur avant la fin de la partie. Les parties d'avant cette migration gardent
-- leur graine de 31 bits (seed, rngKey nul) : leurs rediffusions restent identiques.

-- AlterTable
ALTER TABLE "Battle" ADD COLUMN     "rngKey" CHAR(64);

ALTER TABLE "Battle" ADD CONSTRAINT "Battle_rngKey_hex" CHECK ("rngKey" IS NULL OR "rngKey" ~ '^[0-9a-f]{64}$');

-- Partie ouverte ou en cours d'un joueur (entrée en file ou en salle, sondage, accueil du combat) : une ligne parmi toutes
-- ses parties. Les index (p1Id, createdAt) et (p2Id, createdAt) relisaient tout son historique pour la trouver.
CREATE INDEX "Battle_p1_open_idx" ON "Battle"("p1Id") WHERE "status" IN ('WAITING', 'ACTIVE');
CREATE INDEX "Battle_p2_active_idx" ON "Battle"("p2Id") WHERE "status" = 'ACTIVE';

-- Comptes déjà anonymisés : sortis du classé (positions, top du Grand Champion, divisions, bilan de fin de saison).
-- L'anonymisation remet désormais ces compteurs à zéro elle-même.
UPDATE "User" SET "rankPoints" = 0, "seasonPeakPc" = 0, "seasonPeakGrand" = false, "seasonGames" = 0, "rankProtection" = 0
WHERE "anonymizedAt" IS NOT NULL
  AND ("rankPoints" > 0 OR "seasonPeakPc" > 0 OR "seasonPeakGrand" OR "seasonGames" > 0 OR "rankProtection" > 0);
