-- Vitrines multiples : chaque joueur peut avoir plusieurs vitrines (Showcase), chacune avec ses cartes
-- (ShowcaseItem), sa disposition et son thème. Première étape d'une bascule en deux temps : l'ancienne
-- vitrine unique (ShowcaseSlot, User.showcaseLayout) est reprise ici et laissée en place, inutilisée ;
-- la migration de nettoyage la supprimera une fois le nouveau code en production.

-- CreateTable
CREATE TABLE "Showcase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "name" VARCHAR(32),
    "layout" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'none',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Showcase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShowcaseItem" (
    "showcaseId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "userCardId" TEXT NOT NULL,

    CONSTRAINT "ShowcaseItem_pkey" PRIMARY KEY ("showcaseId","position"),
    CONSTRAINT "ShowcaseItem_position_check" CHECK ("position" >= 1)
);

-- CreateIndex
CREATE INDEX "Showcase_userId_sortOrder_idx" ON "Showcase"("userId", "sortOrder");

-- CreateIndex
CREATE INDEX "ShowcaseItem_userCardId_idx" ON "ShowcaseItem"("userCardId");

-- CreateIndex
CREATE UNIQUE INDEX "ShowcaseItem_showcaseId_userCardId_key" ON "ShowcaseItem"("showcaseId", "userCardId");

-- AddForeignKey
ALTER TABLE "Showcase" ADD CONSTRAINT "Showcase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowcaseItem" ADD CONSTRAINT "ShowcaseItem_showcaseId_fkey" FOREIGN KEY ("showcaseId") REFERENCES "Showcase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowcaseItem" ADD CONSTRAINT "ShowcaseItem_userCardId_fkey" FOREIGN KEY ("userCardId") REFERENCES "UserCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reprise de l'ancienne vitrine (même règle que lib/showcase/legacy.ts). Seules les cases affichées
-- comptent : positions 1 à showcase.slots (4 par défaut), exemplaire encore possédé par le joueur.
-- Les dispositions à 8 cartes ne s'appliquaient qu'à une vitrine de 8 cases : sinon la vitrine était
-- une grille, qui devient la grille contenant sa plus haute case occupée.
INSERT INTO "Showcase" ("id", "userId", "sortOrder", "layout", "updatedAt")
SELECT
    'sc' || md5(u."id" || ':vitrine'),
    u."id",
    0,
    CASE
        WHEN cfg.size = 8 AND u."showcaseLayout" <> 'GRID' THEN u."showcaseLayout"::text
        WHEN COALESCE(m.highest, 0) <= 4 THEN 'GRID_2X2'
        WHEN m.highest <= 6 THEN 'GRID_3X2'
        WHEN m.highest <= 8 THEN 'GRID_4X2'
        WHEN m.highest <= 9 THEN 'GRID_3X3'
        WHEN m.highest <= 12 THEN 'GRID_4X3'
        ELSE 'FRIEZE'
    END,
    CURRENT_TIMESTAMP
FROM "User" u
CROSS JOIN (
    SELECT COALESCE(MAX(CASE WHEN jsonb_typeof("value") = 'number' THEN ("value" #>> '{}')::int END), 4) AS size
    FROM "GameSetting" WHERE "key" = 'showcase.slots'
) cfg
LEFT JOIN (
    SELECT sh."userId", MAX(sh."position") AS highest
    FROM "ShowcaseSlot" sh
    JOIN "UserCard" uc ON uc."id" = sh."userCardId" AND uc."ownerId" = sh."userId"
    WHERE sh."position" >= 1 AND sh."position" <= (
        SELECT COALESCE(MAX(CASE WHEN jsonb_typeof("value") = 'number' THEN ("value" #>> '{}')::int END), 4)
        FROM "GameSetting" WHERE "key" = 'showcase.slots'
    )
    GROUP BY sh."userId"
) m ON m."userId" = u."id"
WHERE m."userId" IS NOT NULL OR (cfg.size = 8 AND u."showcaseLayout" <> 'GRID');

-- Cartes reprises dans la vitrine créée ci-dessus (la Frise en tient 20 au plus)
INSERT INTO "ShowcaseItem" ("showcaseId", "position", "userCardId")
SELECT s."id", sh."position", sh."userCardId"
FROM "ShowcaseSlot" sh
JOIN "UserCard" uc ON uc."id" = sh."userCardId" AND uc."ownerId" = sh."userId"
JOIN "Showcase" s ON s."userId" = sh."userId" AND s."sortOrder" = 0
WHERE sh."position" >= 1
  AND sh."position" <= 20
  AND sh."position" <= (
      SELECT COALESCE(MAX(CASE WHEN jsonb_typeof("value") = 'number' THEN ("value" #>> '{}')::int END), 4)
      FROM "GameSetting" WHERE "key" = 'showcase.slots'
  );
