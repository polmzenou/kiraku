-- Rareté Esprit (SR 霊) : une variante entre Manga Rare et Xtreme Rare, MR < SR < XR (sortOrder 750).
-- Carte spectrale : pleine carte, illustration qui se déforme et bords qui se dissolvent (appearance.spectral).
-- Migration additive : le code déjà déployé lit SR comme une Mythique (legacyBase) et ignore les nouveaux champs.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

INSERT INTO "RarityDefinition" ("key", "nameFr", "nameEn", "sortOrder", "seal", "appearance", "legacyBase", "variantRequired", "updatedAt") VALUES
  ('SR', 'Esprit', 'Spirit', 750, '霊', '{"fullArt":true,"spectral":true,"effects":[]}', 'MYTHIC', true, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- Réglages déjà enregistrés : on ajoute SR sans toucher aux valeurs existantes (la clé déjà là l'emporte).
-- Poids : un peu plus rare que MR, un peu moins que XR, soit la moyenne arrondie au-dessus de leurs poids actuels.
-- Tant qu'aucune Esprit n'est publiée, ces tirages redescendent sur MR (repli du registre).
UPDATE "GameSetting" SET "value" = jsonb_build_object('SR', LEAST(CEIL((
    CASE WHEN jsonb_typeof("value"->'MR') = 'number' THEN ("value"->>'MR')::numeric ELSE 0 END
    + CASE WHEN jsonb_typeof("value"->'XR') = 'number' THEN ("value"->>'XR')::numeric ELSE 0 END) / 2)::int, 1000000)) || "value"
  WHERE "key" = 'booster.rates' AND jsonb_typeof("value") = 'object';
-- Recyclage : entre MR et XR (1 650 Zeni avec les valeurs par défaut).
UPDATE "GameSetting" SET "value" = jsonb_build_object('SR', LEAST(ROUND((
    COALESCE(("value"->>'MR')::numeric, 1050) + COALESCE(("value"->>'XR')::numeric, 2250)) / 2)::int, 100000)) || "value"
  WHERE "key" = 'collection.recycleValues' AND jsonb_typeof("value") = 'object';
-- Passifs : autant que MR ; XR garde le sien en plus.
UPDATE "GameSetting" SET "value" = jsonb_build_object('SR', LEAST(COALESCE(("value"->>'MR')::int, 3), 7)) || "value"
  WHERE "key" = 'battle.keywordsByRarity' AND jsonb_typeof("value") = 'object';
-- Plafond de prix : celui de MR s'il existe (sinon le plafond général).
UPDATE "GameSetting" SET "value" = jsonb_strip_nulls(jsonb_build_object('SR', "value"->'MR')) || "value"
  WHERE "key" = 'market.maxPriceByRarity' AND jsonb_typeof("value") = 'object';
UPDATE "GameSetting" SET "value" = "value" || '["SR"]'::jsonb
  WHERE "key" IN ('gifts.allowedRarities', 'trades.allowedRarities', 'listings.allowedRarities', 'casino.coinflip.allowedRarities')
    AND jsonb_typeof("value") = 'array' AND NOT "value" ? 'SR';
-- Anti-doublons : seulement si la règle protège déjà les Mythiques (une liste vide veut dire règle coupée).
UPDATE "GameSetting" SET "value" = "value" || '["SR"]'::jsonb
  WHERE "key" = 'booster.duplicateGuardRarities' AND jsonb_typeof("value") = 'array' AND "value" ? 'MYTHIC' AND NOT "value" ? 'SR';
-- Ultis : seulement si MR en a déjà un.
UPDATE "GameSetting" SET "value" = "value" || '["SR"]'::jsonb
  WHERE "key" = 'battle.ultimateRarities' AND jsonb_typeof("value") = 'array' AND "value" ? 'MR' AND NOT "value" ? 'SR';
COMMIT;
