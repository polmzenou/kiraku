-- Une carte possédée ne peut plus figurer dans la liste de souhaits : on retire les entrées
-- existantes des cartes que le joueur possède déjà (tous statuts d'exemplaire confondus).
DELETE FROM "WishlistEntry" w
WHERE EXISTS (
  SELECT 1 FROM "UserCard" u WHERE u."ownerId" = w."userId" AND u."cardId" = w."cardId"
);
