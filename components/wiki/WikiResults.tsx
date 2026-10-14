import type { WikiParams } from "@/lib/catalog/wiki-params";
import { selectWikiPage, type CatalogSearchIndex } from "@/lib/catalog/wiki-state";
import { getWikiCollection } from "@/server/catalog/ownership";
import { getCatalogSummaries } from "@/server/catalog/queries";
import { WikiGrid } from "./WikiGrid";

export async function WikiResults({ index, params, locale, emptyCatalog }: {
  index: CatalogSearchIndex;
  params: WikiParams;
  locale: string;
  emptyCatalog: boolean;
}) {
  const collection = await getWikiCollection();
  const page = selectWikiPage(index, params, collection);
  const cards = await getCatalogSummaries(page.ids);
  return <WikiGrid cards={cards} nextAfter={page.nextAfter} params={params} locale={locale} collection={collection} emptyCatalog={emptyCatalog} />;
}
