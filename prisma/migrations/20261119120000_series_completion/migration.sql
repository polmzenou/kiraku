-- Séries complétées, acquises pour de bon : le titre « Devil Hunter » (SERIES_COMPLETE) et le compte de séries
-- complétées ne se reperdent plus quand le joueur donne, vend ou échange une carte de la série, quand une
-- nouvelle carte y est publiée, ni plus tard lors d'un prestige qui viderait la collection.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- CreateTable
CREATE TABLE "SeriesCompletion" (
    "userId" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeriesCompletion_pkey" PRIMARY KEY ("userId","seriesId")
);

-- CreateIndex
CREATE INDEX "SeriesCompletion_seriesId_idx" ON "SeriesCompletion"("seriesId");

-- AddForeignKey
ALTER TABLE "SeriesCompletion" ADD CONSTRAINT "SeriesCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SeriesCompletion" ADD CONSTRAINT "SeriesCompletion_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enregistre les séries que les nouveaux propriétaires des lignes touchées viennent de compléter. Un trigger
-- plutôt qu'un appel dans chaque chemin d'obtention (booster, lot, échange, marché, enchère, avis de recherche,
-- cadeau, pile ou face, admin, scripts) : aucun chemin présent ou futur ne peut l'oublier.
-- Même définition que server/profile/progress.ts : toutes les cartes PUBLISHED de la série, quel que soit le
-- statut de l'exemplaire (en vente, en combat… il appartient toujours au joueur).
CREATE FUNCTION series_completion_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "SeriesCompletion" ("userId", "seriesId", "completedAt")
  SELECT p."ownerId", p."seriesId", now()
  FROM (
    SELECT DISTINCT n."ownerId", c."seriesId"
    FROM series_completion_new n JOIN "Card" c ON c.id = n."cardId"
  ) p
  WHERE NOT EXISTS (
      SELECT 1 FROM "SeriesCompletion" s WHERE s."userId" = p."ownerId" AND s."seriesId" = p."seriesId"
    )
    AND NOT EXISTS (
      SELECT 1 FROM "Card" c
      WHERE c."seriesId" = p."seriesId" AND c.status = 'PUBLISHED'
        AND NOT EXISTS (SELECT 1 FROM "UserCard" uc WHERE uc."ownerId" = p."ownerId" AND uc."cardId" = c.id)
    )
    AND EXISTS (SELECT 1 FROM "Card" c WHERE c."seriesId" = p."seriesId" AND c.status = 'PUBLISHED')
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$$;

-- Mise à jour : seules les lignes qui changent de propriétaire comptent (pas les réservations de statut)
CREATE FUNCTION series_completion_record_moved() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM series_completion_new n JOIN series_completion_old o ON o.id = n.id
    WHERE o."ownerId" IS DISTINCT FROM n."ownerId"
  ) THEN
    INSERT INTO "SeriesCompletion" ("userId", "seriesId", "completedAt")
    SELECT p."ownerId", p."seriesId", now()
    FROM (
      SELECT DISTINCT n."ownerId", c."seriesId"
      FROM series_completion_new n
      JOIN series_completion_old o ON o.id = n.id
      JOIN "Card" c ON c.id = n."cardId"
      WHERE o."ownerId" IS DISTINCT FROM n."ownerId"
    ) p
    WHERE NOT EXISTS (
        SELECT 1 FROM "SeriesCompletion" s WHERE s."userId" = p."ownerId" AND s."seriesId" = p."seriesId"
      )
      AND NOT EXISTS (
        SELECT 1 FROM "Card" c
        WHERE c."seriesId" = p."seriesId" AND c.status = 'PUBLISHED'
          AND NOT EXISTS (SELECT 1 FROM "UserCard" uc WHERE uc."ownerId" = p."ownerId" AND uc."cardId" = c.id)
      )
      AND EXISTS (SELECT 1 FROM "Card" c WHERE c."seriesId" = p."seriesId" AND c.status = 'PUBLISHED')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER series_completion_insert AFTER INSERT ON "UserCard"
  REFERENCING NEW TABLE AS series_completion_new
  FOR EACH STATEMENT EXECUTE FUNCTION series_completion_record();
CREATE TRIGGER series_completion_update AFTER UPDATE ON "UserCard"
  REFERENCING OLD TABLE AS series_completion_old NEW TABLE AS series_completion_new
  FOR EACH STATEMENT EXECUTE FUNCTION series_completion_record_moved();

-- Reprise : les séries complètes aujourd'hui sont acquises
INSERT INTO "SeriesCompletion" ("userId", "seriesId", "completedAt")
SELECT o."ownerId", c."seriesId", now()
FROM (SELECT DISTINCT "ownerId", "cardId" FROM "UserCard") o
JOIN "Card" c ON c.id = o."cardId" AND c.status = 'PUBLISHED'
GROUP BY o."ownerId", c."seriesId"
HAVING COUNT(*) = (SELECT COUNT(*) FROM "Card" t WHERE t."seriesId" = c."seriesId" AND t.status = 'PUBLISHED')
ON CONFLICT DO NOTHING;

COMMIT;
