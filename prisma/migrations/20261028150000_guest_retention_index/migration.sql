-- Purge des invités inactifs : recherche des invités par date de création
CREATE INDEX "User_isGuest_createdAt_idx" ON "User"("isGuest", "createdAt");
