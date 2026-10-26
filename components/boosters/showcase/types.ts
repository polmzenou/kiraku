import type { BoosterPanelData, WishlistInPool } from "@/lib/boosters/panel";
import type { ShowcaseEntry } from "@/lib/boosters/showcase";
import type { BoosterFamily, BoosterTypeView } from "@/lib/boosters/types";

/** Un booster de la vitrine, calculé côté serveur. `panel` est null pour un booster hors sélection. */
export type ShowcaseItem = {
  type: BoosterTypeView;
  cards: number;
  selectable: boolean;
  panel: BoosterPanelData | null;
  wishlist: WishlistInPool | null;
};

export type ShowcaseFamily = {
  family: BoosterFamily;
  kanji: string;
  title: string;
  short: string;
  subtitle: string;
  rotating: boolean;
};

export type Entry = ShowcaseEntry & { item: ShowcaseItem };
