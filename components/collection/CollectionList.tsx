"use client";

import type { ComponentProps } from "react";
import { CollectionGrid } from "./CollectionGrid";
import { useCollectionStore } from "./CollectionStore";

/** Grille remontée à neuf après un « tout recycler » (les pages chargées ne sont plus justes). */
export function CollectionList(props: ComponentProps<typeof CollectionGrid>) {
  const { epoch } = useCollectionStore();
  return <CollectionGrid key={epoch} {...props} />;
}
