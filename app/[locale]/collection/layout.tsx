import { CollectionStoreProvider } from "@/components/collection/CollectionStore";

/** Collection + emplacement `sheet` : la fiche carte s'ouvre par-dessus la liste sans la démonter. */
export default function CollectionLayout({ children, sheet }: LayoutProps<"/[locale]/collection">) {
  return (
    <CollectionStoreProvider>
      {children}
      {sheet}
    </CollectionStoreProvider>
  );
}
