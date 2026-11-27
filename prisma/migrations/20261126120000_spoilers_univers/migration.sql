-- Mode spoiler sur le compte (remplace le cookie kiraku-spoiler) : illustrations spoil floutées par défaut, et univers
-- que le joueur a choisi de voir en clair (clé d'univers = Series.universeId, ou l'id de la série quand elle n'est
-- rangée dans aucun univers). Valeurs par défaut : compatible avec la version encore en ligne pendant le déploiement.
ALTER TABLE "User" ADD COLUMN "spoilerBlur" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "spoilerShown" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "User" ADD CONSTRAINT "User_spoilerShown_check" CHECK (cardinality("spoilerShown") <= 300);
