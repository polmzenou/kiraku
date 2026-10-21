// Google accepte 50 000 URL par sitemap ; chaque fiche y figure en deux langues.
export const WIKI_SITEMAP_CHUNK = 5000;

/** Nombre de sitemaps du wiki, avec un fichier de marge pour les cartes importées d'ici le prochain déploiement. */
export function wikiSitemapCount(total: number, chunk = WIKI_SITEMAP_CHUNK): number {
  return Math.ceil(total / chunk) + 1;
}

/** Cartes du sitemap wiki n° `index` (à partir de 0). */
export function wikiSitemapSlice<T>(rows: readonly T[], index: number, chunk = WIKI_SITEMAP_CHUNK): T[] {
  return index < 0 ? [] : rows.slice(index * chunk, (index + 1) * chunk);
}
