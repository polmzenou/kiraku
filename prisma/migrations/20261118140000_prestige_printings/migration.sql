-- Prestige, lot 16c : éditions gravées numérotées. Un compteur par carte et par tirage (taille figée à sa
-- création, numéros déjà sortis) ; le carrousel « En direct » et le lien de partage d'un tirage gardent l'édition
-- tirée, même après la vente de l'exemplaire.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE "CardPrinting" (
    "cardId" TEXT NOT NULL,
    "printing" INTEGER NOT NULL,
    "size" INTEGER NOT NULL,
    "issued" INTEGER NOT NULL DEFAULT 0,
    "taken" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardPrinting_pkey" PRIMARY KEY ("cardId", "printing"),
    CONSTRAINT "CardPrinting_bounds" CHECK (
      "printing" >= 1 AND "size" BETWEEN 1 AND 10000 AND "issued" BETWEEN 0 AND "size" AND cardinality("taken") = "issued"
    )
);
ALTER TABLE "CardPrinting" ADD CONSTRAINT "CardPrinting_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Un tirage n'avance que dans un sens : taille figée, compteur qui ne redescend pas, numéros déjà sortis gardés
-- dans leur ordre ; chaque numéro entre 1 et la taille, une seule fois. Un numéro recyclé ou consacré ne ressort donc
-- jamais, même si une écriture oubliait la requête de server/prestige/printing.ts.
CREATE FUNCTION cardprinting_forward_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW."cardId" <> OLD."cardId" OR NEW."printing" <> OLD."printing" OR NEW."size" <> OLD."size"
    OR NEW."issued" < OLD."issued" OR NEW."taken"[1:OLD."issued"] IS DISTINCT FROM OLD."taken"
  ) THEN
    RAISE EXCEPTION 'CardPrinting: un tirage ne revient jamais en arrière' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(NEW."taken") AS n WHERE n IS NULL OR n < 1 OR n > NEW."size")
    OR EXISTS (SELECT 1 FROM unnest(NEW."taken") AS n GROUP BY n HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'CardPrinting: numéro hors du tirage ou en double' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER cardprinting_forward_only BEFORE INSERT OR UPDATE ON "CardPrinting" FOR EACH ROW EXECUTE FUNCTION cardprinting_forward_only();

-- Une gravée renvoie au compteur de son tirage (taille affichée « 17 / 25 »). Les exemplaires ordinaires (tirage
-- nul) ne sont pas vérifiés. NOT VALID : aucune ligne existante n'est gravée, la grande table UserCard n'est pas
-- parcourue ; les écritures suivantes sont contrôlées.
ALTER TABLE "UserCard" ADD CONSTRAINT "UserCard_cardId_printing_fkey" FOREIGN KEY ("cardId", "printing") REFERENCES "CardPrinting"("cardId", "printing") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

-- Gros tirage du carrousel : l'édition tirée, copiée à la sortie
ALTER TABLE "NotablePull"
  ADD COLUMN "printing" INTEGER,
  ADD COLUMN "serial" INTEGER,
  ADD COLUMN "printingSize" INTEGER;
ALTER TABLE "NotablePull" ADD CONSTRAINT "NotablePull_engraving_check" CHECK (
  ("printing" IS NULL) = ("serial" IS NULL) AND ("printing" IS NULL) = ("printingSize" IS NULL)
  AND ("printing" IS NULL OR ("printing" >= 1 AND "serial" BETWEEN 1 AND "printingSize"))
);

-- Lien de partage d'un tirage : [{ position, printing, serial, size }] des cartes sorties gravées
ALTER TABLE "BoosterOpening" ADD COLUMN "editions" JSONB;
COMMIT;
