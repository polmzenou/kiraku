import type { WikiParams } from "@/lib/catalog/wiki-params";
import { selectWikiPage, type CatalogSearchIndex } from "@/lib/catalog/wiki-state";
import { getWikiCollection } from "@/server/catalog/ownership";
import { getCatalogSummaries } from "@/server/catalog/queries";
import { WikiGrid } from "./WikiGrid";

export async function WikiResults({ index, params, locale, emptyCatalog, newIds }: {
  index: CatalogSearchIndex;
  params: WikiParams;
  locale: string;
  emptyCatalog: boolean;
  newIds?: ReadonlySet<number>;
}) {
  const collection = await getWikiCollection();
  const page = selectWikiPage(index, params, collection);
  // Filtre par possession : la page dépend de la collection du joueur, sa liste d'ids ne va pas dans le cache commun
  const personal = collection.available && params.ownership !== "all";
  const cards = await getCatalogSummaries(page.ids, { shared: !personal });
  return <WikiGrid cards={cards} nextAfter={page.nextAfter} params={params} locale={locale} collection={collection} emptyCatalog={emptyCatalog} newIds={newIds} />;
}
