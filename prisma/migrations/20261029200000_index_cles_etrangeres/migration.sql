-- Clés étrangères sans index : chaque suppression d'un exemplaire ou d'un compte parcourait toute la
-- table liée (recyclage des doublons, purge des invités, effacements RGPD).
CREATE INDEX "Auction_userCardId_idx" ON "Auction"("userCardId");

CREATE INDEX "Notification_actorId_idx" ON "Notification"("actorId");

CREATE INDEX "ChatMessage_senderId_idx" ON "ChatMessage"("senderId");

CREATE INDEX "LotGrant_adminId_idx" ON "LotGrant"("adminId");

CREATE INDEX "AdminLog_adminId_idx" ON "AdminLog"("adminId");

-- Fenêtres de dates du tableau de bord admin : journaux en ajout seul, un index BRIN suffit et pèse peu.
CREATE INDEX "CoinTransaction_createdAt_idx" ON "CoinTransaction" USING BRIN ("createdAt");

CREATE INDEX "BoosterOpening_createdAt_idx" ON "BoosterOpening" USING BRIN ("createdAt");

CREATE INDEX "Battle_createdAt_idx" ON "Battle" USING BRIN ("createdAt");
