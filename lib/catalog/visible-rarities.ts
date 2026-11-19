// Filtres par rareté : une rareté sans aucune carte publiée n'y apparaît pas (elle n'aurait rien à montrer).
// Celles qu'on doit garder malgré tout (filtre déjà choisi, cartes archivées possédées) restent proposées.

/** Raretés ayant au moins une carte, dans l'ordre du registre. */
export function publishedFromCounts(order: readonly string[], counts: Readonly<Record<string, number | undefined>>): string[] {
  return order.filter((r) => (counts[r] ?? 0) > 0);
}

/**
 * Raretés à proposer dans un filtre, dans l'ordre du registre : les publiées, plus `keep`. Sans liste des
 * publiées (`null` : pages sans base, anciens messages), toutes.
 */
export function visibleRarities(order: readonly string[], published: readonly string[] | null, keep: Iterable<string> = []): string[] {
  if (!published) return [...order];
  const shown = new Set([...published, ...keep]);
  return order.filter((r) => shown.has(r));
}
