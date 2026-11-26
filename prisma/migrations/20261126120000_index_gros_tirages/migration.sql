-- Fil des gros tirages (server/home/pulls.ts) : filtre sur la rareté puis la date. Seule la date était indexée,
-- si bien que presque toute la table était relue à chaque rafraîchissement du carrousel (30 542 parcours en prod).
CREATE INDEX "NotablePull_rarityKey_createdAt_idx" ON "NotablePull"("rarityKey", "createdAt");
