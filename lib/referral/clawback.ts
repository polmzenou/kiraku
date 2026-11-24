// Reprise d'un parrainage v2 (« Révoquer et bannir ») : tout ce que ses versements ont donné, dans la limite de ce que
// le joueur a encore. Les Zeni ne descendent jamais sous zéro, les crédits jamais sous ce qui reste ; seuls les sachets
// encore scellés, les exemplaires encore possédés (en collection, ordinaires, jamais mis aux enchères : l'appelant les
// filtre) et les bons inutilisés sont repris. Le reste est noté comme manquant dans le journal de l'équipe.

/** Ce qu'un versement a donné (ReferralReward.grant). */
export type RewardGrant = {
  zeni: number;
  /** Crédits de boosters par type (BoosterType.id). */
  credits: Readonly<Record<string, number>>;
  sealedIds: readonly string[];
  cardIds: readonly string[];
  voucherIds: readonly string[];
};

/** Ce que le joueur a encore, parmi ce qu'on peut reprendre. */
export type Holdings = {
  coins: number;
  credits: Readonly<Record<string, number>>;
  sealedIds: ReadonlySet<string>;
  cardIds: ReadonlySet<string>;
  voucherIds: ReadonlySet<string>;
};

export type ClawbackPlan = {
  zeni: number;
  credits: Record<string, number>;
  sealedIds: string[];
  cardIds: string[];
  voucherIds: string[];
  /** Ce qui avait été versé et n'a pas pu être repris. */
  missing: { zeni: number; credits: Record<string, number>; sealed: number; cards: number; vouchers: number };
};

const nonNegative = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/** Somme de plusieurs versements (les identifiants en double ne comptent qu'une fois). */
export function sumGrants(grants: readonly RewardGrant[]): RewardGrant {
  const credits: Record<string, number> = {};
  for (const g of grants) for (const [type, n] of Object.entries(g.credits)) credits[type] = (credits[type] ?? 0) + nonNegative(n);
  const unique = (pick: (g: RewardGrant) => readonly string[]) => [...new Set(grants.flatMap(pick))];
  return {
    zeni: grants.reduce((sum, g) => sum + nonNegative(g.zeni), 0),
    credits,
    sealedIds: unique((g) => g.sealedIds),
    cardIds: unique((g) => g.cardIds),
    voucherIds: unique((g) => g.voucherIds),
  };
}

export function planClawback(grants: readonly RewardGrant[], held: Holdings): ClawbackPlan {
  const total = sumGrants(grants);
  const zeni = Math.min(total.zeni, nonNegative(held.coins));
  const credits: Record<string, number> = {};
  const missingCredits: Record<string, number> = {};
  for (const [type, granted] of Object.entries(total.credits)) {
    const take = Math.min(granted, nonNegative(held.credits[type] ?? 0));
    if (take > 0) credits[type] = take;
    if (granted > take) missingCredits[type] = granted - take;
  }
  const sealedIds = total.sealedIds.filter((id) => held.sealedIds.has(id));
  const cardIds = total.cardIds.filter((id) => held.cardIds.has(id));
  const voucherIds = total.voucherIds.filter((id) => held.voucherIds.has(id));
  return {
    zeni,
    credits,
    sealedIds,
    cardIds,
    voucherIds,
    missing: {
      zeni: total.zeni - zeni,
      credits: missingCredits,
      sealed: total.sealedIds.length - sealedIds.length,
      cards: total.cardIds.length - cardIds.length,
      vouchers: total.voucherIds.length - voucherIds.length,
    },
  };
}
