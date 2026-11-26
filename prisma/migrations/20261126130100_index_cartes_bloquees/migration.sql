-- Exemplaires hors collection (enchère, combat, expédition, casino) : quelques dizaines de lignes sur des centaines
-- de milliers. Aucun index ne commençait par status : la santé du séquestre (/admin/casino) relisait toute la table
-- UserCard pour compter les cartes au statut CASINO. Index partiel, servi aussi aux comptages des autres statuts.
CREATE INDEX "UserCard_locked_status_idx" ON "UserCard"("status") WHERE "status" <> 'COLLECTION';
