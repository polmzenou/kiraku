import { RARITIES, type Rarity } from "../catalog/rarity";
import type { SettingValue } from "../settings/defaults";

// Recyclage des doublons en Zeni (section « Raretés et taux de drop » du plan) : on garde toujours
// un exemplaire de chaque carte, et seuls les exemplaires libres (en collection, hors vitrine) partent.

export type RecycleValues = SettingValue<"collection.recycleValues">;

export type OwnedCopy = {
  id: string;
  cardId: string;
  rarity: Rarity;
  status: "COLLECTION" | "AUCTION" | "BATTLE";
  obtainedAt: Date;
};

export type RecycleOptions = {
  values: RecycleValues;
  /** Exemplaires à ne jamais recycler (vitrine) ; ils comptent comme l'exemplaire gardé. */
  protectedIds?: ReadonlySet<string>;
  /** Rareté la plus haute recyclée (« tout recycler jusqu'à Épique »). */
  maxRarity?: Rarity;
  /** Nombre maximum d'exemplaires recyclés par carte (recyclage depuis la fiche). */
  maxPerCard?: number;
};

export type RecyclePlan = {
  ids: string[];
  gain: number;
  byRarity: Record<Rarity, { copies: number; zeni: number }>;
  /** Exemplaires recyclés par carte. */
  byCard: Map<string, number>;
};

export function recycleValue(rarity: Rarity, count: number, values: RecycleValues): number {
  return values[rarity] * count;
}

function emptyByRarity(): RecyclePlan["byRarity"] {
  return Object.fromEntries(RARITIES.map((r) => [r, { copies: 0, zeni: 0 }])) as RecyclePlan["byRarity"];
}

/**
 * Exemplaires à recycler. Par carte : on garde l'exemplaire en vitrine, sinon le plus ancien en
 * collection ; les exemplaires en vente ou en combat ne sont ni recyclés ni comptés comme gardés
 * (ils peuvent partir). Fonction pure et déterministe (départage par id).
 */
export function planRecycle(copies: readonly OwnedCopy[], opts: RecycleOptions): RecyclePlan {
  const protectedIds = opts.protectedIds ?? new Set<string>();
  const maxIndex = opts.maxRarity ? RARITIES.indexOf(opts.maxRarity) : RARITIES.length - 1;
  const maxPerCard = Math.max(0, opts.maxPerCard ?? Infinity);

  const byCardCopies = new Map<string, OwnedCopy[]>();
  for (const c of copies) {
    if (c.status !== "COLLECTION") continue;
    const list = byCardCopies.get(c.cardId);
    if (list) list.push(c);
    else byCardCopies.set(c.cardId, [c]);
  }

  const plan: RecyclePlan = { ids: [], gain: 0, byRarity: emptyByRarity(), byCard: new Map() };
  for (const [cardId, list] of byCardCopies) {
    const rarity = list[0].rarity;
    if (RARITIES.indexOf(rarity) > maxIndex) continue;

    // Plus ancien d'abord : c'est lui qu'on garde si rien n'est en vitrine
    const free = list
      .filter((c) => !protectedIds.has(c.id))
      .sort((a, b) => a.obtainedAt.getTime() - b.obtainedAt.getTime() || a.id.localeCompare(b.id));
    const keepFree = free.length < list.length ? 0 : 1;
    // Les plus récents partent en premier
    const taken = free.slice(keepFree).reverse().slice(0, maxPerCard);
    if (taken.length === 0) continue;

    plan.ids.push(...taken.map((c) => c.id));
    plan.byCard.set(cardId, taken.length);
    const zeni = recycleValue(rarity, taken.length, opts.values);
    plan.byRarity[rarity].copies += taken.length;
    plan.byRarity[rarity].zeni += zeni;
    plan.gain += zeni;
  }
  return plan;
}
