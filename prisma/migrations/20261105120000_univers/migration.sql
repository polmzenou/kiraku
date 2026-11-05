-- Univers : regroupe des séries (JJK, JJK Manga, JJK Modulo) pour la synergie de combat.
-- Purement additive : une série sans univers forme son propre univers, rien à remplir.
CREATE TABLE "Universe" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Universe_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Series" ADD COLUMN "universeId" TEXT;

CREATE INDEX "Series_universeId_idx" ON "Series"("universeId");

ALTER TABLE "Series" ADD CONSTRAINT "Series_universeId_fkey" FOREIGN KEY ("universeId") REFERENCES "Universe"("id") ON DELETE SET NULL ON UPDATE CASCADE;
