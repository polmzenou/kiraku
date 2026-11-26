-- Boosters offerts par une renaissance ({ slug, count }), gardés dans la photo du cycle : seul le compteur
-- BoosterCredit était incrémenté, si bien que l'équipe ne pouvait plus dire ce qu'une renaissance avait donné une fois
-- le réglage changé. NULL : rien d'offert, ou cycle antérieur à cette colonne.
ALTER TABLE "PrestigeCycle" ADD COLUMN "boosters" JSONB;
