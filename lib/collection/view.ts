import type { CardView } from "../boosters/view";
import type { Rarity } from "../catalog/rarity";

// Données d'affichage de la collection envoyées au client (toutes calculées par le serveur).

export type CollectionItem = CardView & {
  /** Exemplaires possédés, tous statuts confondus. */
  copies: number;
  /** Exemplaires libres (en collection : ni en vente ni en combat). */
  free: number;
  /** Doublons recyclables : exemplaires en collection moins celui qu'on garde. */
  recyclable: number;
  /** Exemplaires ordinaires en collection (ni héritiers ni gravés) : sans eux, la renaissance ne garde pas la carte cochée. */
  ordinary?: number;
  inShowcase: boolean;
  /** Collection d'un autre joueur : le visiteur possède déjà cette carte (absent sinon). */
  viewerOwns?: boolean;
  /** Prestige : plus haut héritage parmi les exemplaires, et au moins une édition gravée (pastilles de la vignette). */
  heritage?: number;
  engraved?: boolean;
};

export type CollectionPage = { items: CollectionItem[]; nextOffset: number | null };

export type RarityTotals = {
  unique: number;
  copies: number;
  recyclable: number;
  zeni: number;
  /** Cartes distinctes publiées possédées (accès à la renaissance, prestige). */
  inCatalog: number;
};

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
