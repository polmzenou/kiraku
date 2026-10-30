-- Boutique : le pack de 5 boosters Tout anime passe à 100 achats par jour et par joueur (sans limite jusqu'ici).
-- Visé par son lot du seed, qui reste le même si l'article est renommé dans l'admin
UPDATE "ShopItem" SET "perUserLimit" = 100, "limitPeriod" = 'DAILY', "updatedAt" = CURRENT_TIMESTAMP
WHERE "lotId" = 'seed-lot-pack-5';
