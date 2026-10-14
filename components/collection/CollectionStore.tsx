"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { CollectionItem } from "@/lib/collection/view";

// Corrections locales de la liste après une action faite dans la fiche (recyclage, vitrine) :
// la liste virtualisée garde ses pages chargées et sa position, seules les cartes touchées changent.
// Après un « tout recycler », `reset` recharge la liste depuis la première page.

type Patch = Partial<Pick<CollectionItem, "copies" | "recyclable" | "inShowcase">>;

type Store = {
  patches: Record<string, Patch>;
  patch: (cardId: string, patch: Patch) => void;
  epoch: number;
  reset: () => void;
};

const StoreContext = createContext<Store | null>(null);

export function CollectionStoreProvider({ children }: { children: ReactNode }) {
  const [patches, setPatches] = useState<Record<string, Patch>>({});
  const [epoch, setEpoch] = useState(0);
  const patch = useCallback(
    (cardId: string, p: Patch) => setPatches((all) => ({ ...all, [cardId]: { ...all[cardId], ...p } })),
    [],
  );
  const reset = useCallback(() => {
    setPatches({});
    setEpoch((e) => e + 1);
  }, []);
  const value = useMemo(() => ({ patches, patch, epoch, reset }), [patches, patch, epoch, reset]);
  return <StoreContext value={value}>{children}</StoreContext>;
}

const noop: Store = { patches: {}, patch: () => {}, epoch: 0, reset: () => {} };

/** Hors de /collection (profil public), les corrections ne servent à rien : on renvoie un magasin vide. */
export function useCollectionStore(): Store {
  return useContext(StoreContext) ?? noop;
}
