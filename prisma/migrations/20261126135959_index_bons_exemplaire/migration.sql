-- Bons du parrainage v2 (Voucher) : la clé étrangère vers UserCard (ON DELETE SET NULL) n'avait pas d'index. Chaque
-- exemplaire supprimé (renaissance, jusqu'à 100 000 lignes, recyclage en masse, consécration, suppression de compte)
-- relançait une mise à jour de Voucher par parcours complet de la table. Index simple, comme les autres clés étrangères
-- de UserCard (table petite : pas besoin de CONCURRENTLY, qui ne passe pas dans le lot d'une migration).
CREATE INDEX "Voucher_userCardId_idx" ON "Voucher"("userCardId");
