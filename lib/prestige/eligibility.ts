// Accès à la renaissance : dans chaque rareté, posséder au moins `pct` % des cartes publiées de cette rareté
// (prestige.requiredPercent). Le nombre exigé est arrondi au supérieur ; une rareté sans carte publiée, réglée
// à 0 % ou absente du réglage ne compte pas. Fonctions pures : les décomptes viennent du serveur.

export type RarityRequirement = {
  rarity: string;
  /** Cartes publiées de la rareté. */
  published: number;
  /** Cartes distinctes publiées que le joueur possède. */
  owned: number;
  /** Cartes exigées (arrondi au supérieur). */
  required: number;
  pct: number;
  met: boolean;
};

export function requiredCount(published: number, pct: number): number {
  if (published <= 0 || pct <= 0) return 0;
  return Math.ceil((published * pct) / 100);
}

export type Eligibility = {
  /** Une ligne par rareté qui compte, dans l'ordre du registre. */
  rows: RarityRequirement[];
  eligible: boolean;
  /** Raretés publiées absentes du réglage : l'admin les signale (elles ne comptent pas). */
  unset: string[];
};

export function eligibilityOf(input: {
  order: readonly string[];
  published: Readonly<Record<string, number>>;
  owned: Readonly<Record<string, number>>;
  percent: Readonly<Record<string, number>>;
}): Eligibility {
  const rows: RarityRequirement[] = [];
  const unset: string[] = [];
  for (const rarity of input.order) {
    const published = input.published[rarity] ?? 0;
    if (published <= 0) continue;
    const pct = input.percent[rarity];
    if (pct === undefined) {
      unset.push(rarity);
      continue;
    }
    const required = requiredCount(published, pct);
    if (required === 0) continue;
    const owned = Math.min(input.owned[rarity] ?? 0, published);
    rows.push({ rarity, published, owned, required, pct, met: owned >= required });
  }
  return { rows, eligible: rows.length > 0 && rows.every((r) => r.met), unset };
}
