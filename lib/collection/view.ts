import type { CardView } from "../boosters/view";
import type { Rarity } from "../catalog/rarity";

// Données d'affichage de la collection envoyées au client (toutes calculées par le serveur).

export type CollectionItem = CardView & {
  /** Exemplaires possédés, tous statuts confondus. */
  copies: number;
  /** Doublons recyclables : exemplaires en collection moins celui qu'on garde. */
  recyclable: number;
  inShowcase: boolean;
};

export type CollectionPage = { items: CollectionItem[]; nextOffset: number | null };

export type RarityTotals = { unique: number; copies: number; recyclable: number; zeni: number };

export type CollectionSummary = {
  unique: number;
  copies: number;
  /** Cartes distinctes encore au catalogue (pour le % complété). */
  inCatalog: number;
  catalogTotal: number;
  recyclable: number;
  recyclableZeni: number;
  byRarity: Record<Rarity, RarityTotals>;
};

export type ShowcaseCard = CardView & { position: number };

/** Part du catalogue complétée, de 0 à 1. */
export function completion(summary: Pick<CollectionSummary, "inCatalog" | "catalogTotal">): number {
  return summary.catalogTotal > 0 ? Math.min(1, summary.inCatalog / summary.catalogTotal) : 0;
}
