BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TABLE "RarityDefinition" (
  "key" TEXT PRIMARY KEY, "nameFr" TEXT NOT NULL, "nameEn" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL, "seal" TEXT NOT NULL, "appearance" JSONB NOT NULL DEFAULT '{}',
  "legacyBase" "Rarity" NOT NULL DEFAULT 'COMMON',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "RarityDefinition" ("key", "nameFr", "nameEn", "sortOrder", "seal", "legacyBase") VALUES
 ('COMMON','Commune','Common',0,'並','COMMON'), ('UNCOMMON','Peu commune','Uncommon',100,'良','UNCOMMON'),
 ('RARE','Rare','Rare',200,'稀','RARE'), ('EPIC','Épique','Epic',300,'秀','EPIC'),
 ('LEGENDARY','Légendaire','Legendary',400,'金','LEGENDARY'), ('MYTHIC','Mythique','Mythic',500,'神','MYTHIC');
-- Expansion uniquement : ni le type Rarity, ni ses anciennes colonnes ne sont supprimés.
ALTER TABLE "Card" ADD COLUMN "rarityKey" TEXT;
ALTER TABLE "NotablePull" ADD COLUMN "rarityKey" TEXT;
ALTER TABLE "LotItem" ADD COLUMN "rarityKey" TEXT;
ALTER TABLE "Mission" ADD COLUMN "rarityKey" TEXT;
UPDATE "Card" SET "rarityKey" = "rarity"::text;
UPDATE "NotablePull" SET "rarityKey" = "rarity"::text;
UPDATE "LotItem" SET "rarityKey" = "rarity"::text;
UPDATE "Mission" SET "rarityKey" = "rarity"::text;
ALTER TABLE "Card" ALTER COLUMN "rarityKey" SET NOT NULL, ALTER COLUMN "rarity" SET DEFAULT 'COMMON';
ALTER TABLE "NotablePull" ALTER COLUMN "rarityKey" SET NOT NULL, ALTER COLUMN "rarity" SET DEFAULT 'COMMON';
ALTER TABLE "Card" ADD CONSTRAINT "Card_rarityKey_fkey" FOREIGN KEY ("rarityKey") REFERENCES "RarityDefinition"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NotablePull" ADD CONSTRAINT "NotablePull_rarityKey_fkey" FOREIGN KEY ("rarityKey") REFERENCES "RarityDefinition"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LotItem" ADD CONSTRAINT "LotItem_rarityKey_fkey" FOREIGN KEY ("rarityKey") REFERENCES "RarityDefinition"("key") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_rarityKey_fkey" FOREIGN KEY ("rarityKey") REFERENCES "RarityDefinition"("key") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Card_rarityKey_rank_idx" ON "Card"("rarityKey", "rank");

-- Un ancien client écrit rarity ; le nouveau écrit rarityKey. Les deux restent cohérents.
-- Le modèle de départ est copié dans legacyBase et ne dépend plus ensuite de son modèle.
CREATE FUNCTION catalog_sync_rarity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."rarityKey" IS NULL THEN NEW."rarityKey" := NEW.rarity::text;
    ELSE SELECT "legacyBase" INTO NEW.rarity FROM "RarityDefinition" WHERE key = NEW."rarityKey";
    END IF;
  ELSIF NEW."rarityKey" IS DISTINCT FROM OLD."rarityKey" THEN
    SELECT "legacyBase" INTO NEW.rarity FROM "RarityDefinition" WHERE key = NEW."rarityKey";
  ELSIF NEW.rarity IS DISTINCT FROM OLD.rarity THEN
    NEW."rarityKey" := NEW.rarity::text;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER catalog_sync_rarity BEFORE INSERT OR UPDATE ON "Card" FOR EACH ROW EXECUTE FUNCTION catalog_sync_rarity();
CREATE TRIGGER catalog_sync_rarity BEFORE INSERT OR UPDATE ON "NotablePull" FOR EACH ROW EXECUTE FUNCTION catalog_sync_rarity();
CREATE TRIGGER catalog_sync_rarity BEFORE INSERT OR UPDATE ON "LotItem" FOR EACH ROW EXECUTE FUNCTION catalog_sync_rarity();
CREATE TRIGGER catalog_sync_rarity BEFORE INSERT OR UPDATE ON "Mission" FOR EACH ROW EXECUTE FUNCTION catalog_sync_rarity();
CREATE TYPE "CatalogCardStatus" AS ENUM ('DRAFT','PUBLISHED','ARCHIVED');
ALTER TABLE "Series" ALTER COLUMN "anilistId" DROP NOT NULL;
ALTER TABLE "Card" ALTER COLUMN "anilistId" DROP NOT NULL;
CREATE SEQUENCE "Card_publicId_seq";
ALTER TABLE "Card" ADD COLUMN "publicId" INTEGER,
 ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'ANILIST',
 ADD COLUMN "status" "CatalogCardStatus" NOT NULL DEFAULT 'PUBLISHED',
 ADD COLUMN "description" JSONB NOT NULL DEFAULT '{}', ADD COLUMN "appearance" JSONB NOT NULL DEFAULT '{}',
 ADD COLUMN "dropWeight" INTEGER NOT NULL DEFAULT 1,
 ADD COLUMN "adminOverrides" TEXT[] NOT NULL DEFAULT '{}', ADD COLUMN "boosterIds" TEXT[] NOT NULL DEFAULT '{}';
UPDATE "Card" SET "publicId" = "anilistId", "status" = CASE WHEN "rank" IS NULL THEN 'ARCHIVED'::"CatalogCardStatus" ELSE 'PUBLISHED'::"CatalogCardStatus" END;
-- Espace réservé aux créations originales, séparé des numéros AniList.
SELECT setval('"Card_publicId_seq"', GREATEST(COALESCE((SELECT MAX("publicId") FROM "Card"),0) + 1,1000000000), false);
ALTER TABLE "Card" ALTER COLUMN "publicId" SET NOT NULL, ALTER COLUMN "publicId" SET DEFAULT nextval('"Card_publicId_seq"');
ALTER SEQUENCE "Card_publicId_seq" OWNED BY "Card"."publicId";
CREATE UNIQUE INDEX "Card_publicId_key" ON "Card"("publicId");
CREATE INDEX "Card_status_origin_idx" ON "Card"("status","origin");
ALTER TABLE "Card" ADD CONSTRAINT "Card_dropWeight_check" CHECK ("dropWeight" BETWEEN 0 AND 1000000);
-- Les importeurs déjà déployés ne connaissent pas les nouvelles colonnes.
CREATE FUNCTION catalog_sync_card_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.origin = 'ANILIST' THEN
    IF TG_OP = 'INSERT' AND NEW."anilistId" IS NOT NULL THEN NEW."publicId" := NEW."anilistId"; END IF;
    IF NOT ('status' = ANY(NEW."adminOverrides")) THEN
      NEW.status := CASE WHEN NEW.rank IS NULL THEN 'ARCHIVED'::"CatalogCardStatus" ELSE 'PUBLISHED'::"CatalogCardStatus" END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER catalog_sync_card_identity BEFORE INSERT OR UPDATE ON "Card" FOR EACH ROW EXECUTE FUNCTION catalog_sync_card_identity();
COMMIT;
