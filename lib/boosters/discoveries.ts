// Découvertes à écrire après un tirage (server/boosters/open-core.ts) : une carte jamais obtenue, ou, pour un joueur
// au prestige 1 ou plus, une carte découverte lors d'un cycle passé et pas encore retrouvée dans celui-ci.
// Calculé à partir des découvertes relues en base, avant que le tirage ne marque les cartes comme vues : calculée
// après, la liste était toujours vide et plus aucune ouverture n'écrivait de découverte (régression du 19/11).

/** Découverte déjà en base pour une carte tirée. */
export type KnownDiscovery = { cardId: string; regainedAt: Date | null };

/** Ids des cartes tirées à passer à recordDiscoveries, sans doublon, dans l'ordre du tirage. */
export function discoveriesToRecord(drawnIds: readonly string[], known: readonly KnownDiscovery[], prestige: number): string[] {
  const byCard = new Map(known.map((k) => [k.cardId, k]));
  return [...new Set(drawnIds)].filter((id) => {
    const k = byCard.get(id);
    return !k || (prestige > 0 && k.regainedAt === null);
  });
}
