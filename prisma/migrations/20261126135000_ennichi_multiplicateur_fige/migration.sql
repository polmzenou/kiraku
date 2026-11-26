-- Ennichi : le multiplicateur des étapes 1 et 2 est figé au rattachement d'un ami arrivé pendant la fête. Les
-- versements (étape 2 jusqu'à 48 h après, validation tardive d'un parrainage bloqué) et la file « À vérifier » le
-- lisent ici, et non plus dans le réglage ennichi.stepMultiplier du moment.

-- AlterTable
ALTER TABLE "Referral" ADD COLUMN     "ennichiMultiplier" SMALLINT;

-- Parrainages déjà arrivés pendant une fête : la valeur actuelle du réglage (2 par défaut)
UPDATE "Referral" SET "ennichiMultiplier" = (
    SELECT GREATEST(1, LEAST(10, COALESCE(MAX(CASE WHEN jsonb_typeof("value") = 'number' THEN ("value" #>> '{}')::int END), 2)))
    FROM "GameSetting" WHERE "key" = 'ennichi.stepMultiplier'
)
WHERE "ennichiEdition" IS NOT NULL;

-- Un multiplicateur seulement pour un ami arrivé pendant une fête, entre 1 et 10 (bornes du réglage)
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_ennichi_multiplier_check" CHECK (
    "ennichiMultiplier" IS NULL OR ("ennichiEdition" IS NOT NULL AND "ennichiMultiplier" BETWEEN 1 AND 10)
);
