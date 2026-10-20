-- Variantes (formes alternatives AR, versions Gold) et deux raretés au-dessus de Mythique.
-- Migration additive : le code déjà déployé ignore les nouvelles colonnes et lit AR/GOLD comme Mythique (legacyBase).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE "RarityDefinition" ADD COLUMN "variantRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Card" ADD COLUMN "variantOfId" TEXT, ADD COLUMN "formName" TEXT;
CREATE INDEX "Card_variantOfId_idx" ON "Card"("variantOfId");
ALTER TABLE "Card" ADD CONSTRAINT "Card_variantOfId_fkey" FOREIGN KEY ("variantOfId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "RarityDefinition" ("key", "nameFr", "nameEn", "sortOrder", "seal", "appearance", "legacyBase", "variantRequired", "updatedAt") VALUES
  ('AR', 'AR', 'AR', 600, '異', '{}', 'MYTHIC', true, CURRENT_TIMESTAMP),
  ('GOLD', 'Gold', 'Gold', 700, '煌', '{"artTone":"gold"}', 'MYTHIC', true, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- Réglages déjà enregistrés : on ajoute les nouvelles clés sans toucher aux valeurs existantes.
-- Taux : AR et Gold prennent 10 parts sur Mythique, la part « Mythique ou mieux » ne change pas.
UPDATE "GameSetting" SET "value" = "value" || jsonb_build_object('MYTHIC', ("value"->>'MYTHIC')::int - 10, 'AR', 8, 'GOLD', 2)
  WHERE "key" = 'booster.rates' AND jsonb_typeof("value") = 'object' AND NOT "value" ? 'AR' AND NOT "value" ? 'GOLD'
    AND jsonb_typeof("value"->'MYTHIC') = 'number' AND ("value"->>'MYTHIC')::int >= 10;
UPDATE "GameSetting" SET "value" = jsonb_build_object('AR', 0, 'GOLD', 0) || "value"
  WHERE "key" = 'booster.rates' AND jsonb_typeof("value") = 'object';
-- Recyclage : proportionnel à la valeur Mythique déjà réglée (×3 et ×7).
UPDATE "GameSetting" SET "value" = jsonb_build_object(
    'AR', COALESCE(("value"->>'MYTHIC')::int * 3, 450), 'GOLD', COALESCE(("value"->>'MYTHIC')::int * 7, 1050)) || "value"
  WHERE "key" = 'collection.recycleValues' AND jsonb_typeof("value") = 'object';
UPDATE "GameSetting" SET "value" = jsonb_build_object('AR', 2, 'GOLD', 3) || "value"
  WHERE "key" = 'battle.keywordsByRarity' AND jsonb_typeof("value") = 'object';
UPDATE "GameSetting" SET "value" = "value" || (
    SELECT COALESCE(jsonb_agg(k), '[]'::jsonb) FROM unnest(ARRAY['AR', 'GOLD']) AS k WHERE NOT ("value" ? k)
  ) WHERE "key" IN ('gifts.allowedRarities', 'trades.allowedRarities') AND jsonb_typeof("value") = 'array';
COMMIT;
