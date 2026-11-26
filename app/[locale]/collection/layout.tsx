import { CollectionStoreProvider } from "@/components/collection/CollectionStore";
import { ConsecrationRiteHost } from "@/components/prestige/ConsecrationRiteHost";

/**
 * Collection + emplacement `sheet` : la fiche carte s'ouvre par-dessus la liste sans la démonter. Le rite de
 * consécration vit ici, hors de la fiche que l'action refait.
 */
export default function CollectionLayout({ children, sheet }: LayoutProps<"/[locale]/collection">) {
  return (
    <CollectionStoreProvider>
      <ConsecrationRiteHost>
        {children}
        {sheet}
      </ConsecrationRiteHost>
    </CollectionStoreProvider>
  );
}
