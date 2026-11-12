-- AlterTable : date de première publication d'une carte depuis l'admin (sorties de /wiki/nouveautes, badge « Nouveau »)
ALTER TABLE "Card" ADD COLUMN "publishedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Card_origin_publishedAt_idx" ON "Card"("origin", "publishedAt");

-- Rattrapage des créations de l'admin déjà publiées (ou publiées puis archivées) : la première fois que le
-- journal admin les montre publiées (création, édition ou publication groupée), sinon leur date de création.
-- Les imports AniList restent vides : ils ne comptent pas comme nouvelles cartes.
UPDATE "Card" SET "publishedAt" = "createdAt"
WHERE "origin" = 'CUSTOM' AND "status" IN ('PUBLISHED', 'ARCHIVED') AND "publishedAt" IS NULL;

UPDATE "Card" c SET "publishedAt" = first."at"
FROM (
  SELECT "targetId" AS "id", min("createdAt") AS "at"
  FROM "AdminLog"
  WHERE "targetType" = 'Card' AND "targetId" IS NOT NULL AND "after"->>'status' = 'PUBLISHED'
  GROUP BY "targetId"
) first
WHERE c."id" = first."id" AND c."origin" = 'CUSTOM' AND c."status" IN ('PUBLISHED', 'ARCHIVED');
