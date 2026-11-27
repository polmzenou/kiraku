-- Journal de l'équipe (AdminLog) : lu par sa cible (fiche d'un joueur, relance d'un import Kyara sous le verrou de la
-- demande, file Kyara, codes perso et suivi du parrainage) avec seuls createdAt et adminId indexés : parcours complet
-- de la table à chaque lecture (1 375 en un mois), sur une table qui ne fait que grossir. createdAt en dernier : les
-- lectures d'une cible sont triées par date. Table petite : pas besoin de CONCURRENTLY.
CREATE INDEX "AdminLog_targetType_targetId_createdAt_idx" ON "AdminLog"("targetType", "targetId", "createdAt");
