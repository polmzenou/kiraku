-- Raretés visuelles : BR = Mythique < AR = VR < Gold = MR < XR. Des variantes, avec l'holographie en préréglage (et le Full Art pour XR).
-- Migration additive : poids 0, donc rien ne change aux tirages tant que l'admin ne règle pas leur poids.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

INSERT INTO "RarityDefinition" ("key", "nameFr", "nameEn", "sortOrder", "seal", "appearance", "legacyBase", "variantRequired", "updatedAt") VALUES
  ('BR', 'Black Rare', 'Black Rare', 500, '闇', '{"effects":["holographic"],"intensity":0.25}', 'MYTHIC', true, CURRENT_TIMESTAMP),
  ('VR', 'Vitrail Rare', 'Vitrail Rare', 600, '彩', '{"effects":["holographic"],"intensity":0.25}', 'MYTHIC', true, CURRENT_TIMESTAMP),
  ('MR', 'Manga Rare', 'Manga Rare', 700, '漫', '{"effects":["holographic"],"intensity":0.25}', 'MYTHIC', true, CURRENT_TIMESTAMP),
  ('XR', 'Xtreme Rare', 'Xtreme Rare', 800, '極', '{"fullArt":true,"effects":["holographic"],"intensity":0.25}', 'MYTHIC', true, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- Réglages déjà enregistrés : on ajoute les nouvelles clés sans toucher aux valeurs existantes.
UPDATE "GameSetting" SET "value" = jsonb_build_object('BR', 0, 'VR', 0, 'MR', 0, 'XR', 0) || "value"
  WHERE "key" = 'booster.rates' AND jsonb_typeof("value") = 'object';
-- Recyclage et passifs : la valeur déjà réglée pour le même rang ; XR au-dessus de Gold (recyclage ×15 Mythique, un passif de plus).
UPDATE "GameSetting" SET "value" = jsonb_build_object(
    'BR', COALESCE(("value"->>'MYTHIC')::int, 150), 'VR', COALESCE(("value"->>'AR')::int, 450), 'MR', COALESCE(("value"->>'GOLD')::int, 1050),
    'XR', LEAST(COALESCE(("value"->>'MYTHIC')::int * 15, 2250), 100000)) || "value"
  WHERE "key" = 'collection.recycleValues' AND jsonb_typeof("value") = 'object';
UPDATE "GameSetting" SET "value" = jsonb_build_object(
    'BR', COALESCE(("value"->>'MYTHIC')::int, 2), 'VR', COALESCE(("value"->>'AR')::int, 2), 'MR', COALESCE(("value"->>'GOLD')::int, 3),
    'XR', LEAST(COALESCE(("value"->>'GOLD')::int + 1, 4), 7)) || "value"
  WHERE "key" = 'battle.keywordsByRarity' AND jsonb_typeof("value") = 'object';
-- Plafonds de prix : ceux du même rang s'ils existent (XR garde le plafond général).
UPDATE "GameSetting" SET "value" = jsonb_strip_nulls(jsonb_build_object('BR', "value"->'MYTHIC', 'VR', "value"->'AR', 'MR', "value"->'GOLD')) || "value"
  WHERE "key" = 'market.maxPriceByRarity' AND jsonb_typeof("value") = 'object';
UPDATE "GameSetting" SET "value" = "value" || (
    SELECT COALESCE(jsonb_agg(k), '[]'::jsonb) FROM unnest(ARRAY['BR', 'VR', 'MR', 'XR']) AS k WHERE NOT ("value" ? k)
  ) WHERE "key" IN ('gifts.allowedRarities', 'trades.allowedRarities', 'listings.allowedRarities') AND jsonb_typeof("value") = 'array';
-- Anti-doublons : seulement si la règle protège déjà les Mythiques (une liste vide veut dire règle coupée).
UPDATE "GameSetting" SET "value" = "value" || (
    SELECT COALESCE(jsonb_agg(k), '[]'::jsonb) FROM unnest(ARRAY['BR', 'VR', 'MR', 'XR']) AS k WHERE NOT ("value" ? k)
  ) WHERE "key" = 'booster.duplicateGuardRarities' AND jsonb_typeof("value") = 'array' AND "value" ? 'MYTHIC';
COMMIT;
