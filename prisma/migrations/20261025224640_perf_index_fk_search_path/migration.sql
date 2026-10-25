-- Charge de la base (25/10/2026) : index des clés étrangères interrogées ou supprimées en cascade,
-- et search_path figé des fonctions (alerte « Function Search Path Mutable » de Supabase).

-- CreateIndex
CREATE INDEX "Discovery_cardId_idx" ON "Discovery"("cardId");

-- CreateIndex
CREATE INDEX "NotablePull_userId_idx" ON "NotablePull"("userId");

-- CreateIndex
CREATE INDEX "UserCard_cardId_idx" ON "UserCard"("cardId");

-- Ces fonctions n'utilisent que des fonctions natives et des objets de public : on fige le chemin
-- pour qu'un schéma ajouté plus tôt dans le search_path ne puisse pas les détourner.
ALTER FUNCTION kiraku_referral_code() SET search_path = public;
ALTER FUNCTION catalog_sync_rarity() SET search_path = public;
ALTER FUNCTION catalog_sync_card_identity() SET search_path = public;
