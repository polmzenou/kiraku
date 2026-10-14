import { RARITIES, type Rarity } from "@/lib/catalog/rarity";
import { floorsFor, ratesFrom, rarityIndex, type DrawBonuses, type DrawRules, type RarityRates } from "./draw";

// Probabilités exactes (sans hasard) d'un booster : affichées dans le panneau « Chance par booster »,
// dans l'aperçu d'impact de l'admin, et comparées à la simulation dans les tests.

export type RarityOdds = Record<Rarity, number>;

const zeroOdds = (): RarityOdds => Object.fromEntries(RARITIES.map((r) => [r, 0])) as RarityOdds;

/** Nombre de cartes par rareté dans le pool d'un type (un palier vide se replie au tirage). */
export type PoolCounts = Readonly<Record<Rarity, number>>;

/** Rareté réellement obtenue quand on tire `r` : même repli que pickCard (descend, puis remonte). */
export function resolveRarity(r: Rarity, counts?: PoolCounts): Rarity {
  if (!counts) return r;
  const i = rarityIndex(r);
  const order = [...RARITIES.slice(0, i + 1).reverse(), ...RARITIES.slice(i + 1)];
  return order.find((x) => counts[x] > 0) ?? r;
}

/** Rareté tirée (avant repli) pour un emplacement de plancher `floor`. */
export function rolledDistribution(rates: RarityRates, floor: Rarity): RarityOdds {
  const table = ratesFrom(rates, floor);
  const total = table.reduce((s, [, w]) => s + w, 0);
  const odds = zeroOdds();
  if (total <= 0) {
    odds[floor] = 1;
    return odds;
  }
  for (const [r, w] of table) odds[r] = w / total;
  return odds;
}

/** Probabilité de chaque rareté obtenue pour un emplacement, paliers vides du pool repliés. */
export function slotDistribution(rates: RarityRates, floor: Rarity, counts?: PoolCounts): RarityOdds {
  const rolled = rolledDistribution(rates, floor);
  if (!counts) return rolled;
  const odds = zeroOdds();
  for (const r of RARITIES) odds[resolveRarity(r, counts)] += rolled[r];
  return odds;
}

/** P(au moins une carte de rareté ≥ R dans le booster), pour chaque R. */
export function atLeastOdds(rates: RarityRates, floors: readonly Rarity[], counts?: PoolCounts): RarityOdds {
  const slots = floors.map((f) => slotDistribution(rates, f, counts));
  const result = zeroOdds();
  for (const target of RARITIES) {
    const t = rarityIndex(target);
    const none = slots.reduce((p, slot) => {
      const atLeast = RARITIES.reduce((s, r) => (rarityIndex(r) >= t ? s + slot[r] : s), 0);
      return p * (1 - atLeast);
    }, 1);
    result[target] = 1 - none;
  }
  return result;
}

/** Règles d'un type : sans doré ni divin si le type n'y a pas droit, sans pitié s'il n'y compte pas. */
export function rulesWithBonuses(rules: DrawRules, bonuses: DrawBonuses): DrawRules {
  return {
    ...rules,
    goldenEvery: bonuses.golden ? rules.goldenEvery : 0,
    divineOdds: bonuses.divine ? rules.divineOdds : 0,
    pityThreshold: bonuses.pity ? rules.pityThreshold : Number.MAX_SAFE_INTEGER,
  };
}

/**
 * Chance qu'un emplacement donne une vedette : la rareté tirée a des vedettes et la part `rate`
 * tombe dessus, ou le tirage normal tombe sur une vedette présente dans le pool.
 */
export function featuredSlotChance(
  rates: RarityRates,
  floor: Rarity,
  input: { rate: number; featured: PoolCounts; counts: PoolCounts },
): number {
  const share = Math.min(Math.max(input.rate, 0), 10_000) / 10_000;
  const rolled = rolledDistribution(rates, floor);
  let p = 0;
  for (const r of RARITIES) {
    if (rolled[r] === 0) continue;
    const direct = input.featured[r] > 0 ? share : 0;
    const res = resolveRarity(r, input.counts);
    const inPool = input.counts[res] > 0 ? Math.min(1, input.featured[res] / input.counts[res]) : 0;
    p += rolled[r] * (direct + (1 - direct) * inPool);
  }
  return p;
}

/** Chance d'au moins une vedette dans un booster normal. */
export function featuredBoosterChance(
  rates: RarityRates,
  floors: readonly Rarity[],
  input: { rate: number; featured: PoolCounts; counts: PoolCounts },
): number {
  return 1 - floors.reduce((none, f) => none * (1 - featuredSlotChance(rates, f, input)), 1);
}

/** Écart moyen entre deux vedettes avec une pitié au N-ième booster : Σ (1 − q)^k pour k < N. */
export function featuredMeanGap(perBooster: number, pityThreshold: number): number {
  if (pityThreshold <= 0) return perBooster > 0 ? 1 / perBooster : Infinity;
  if (perBooster <= 0) return pityThreshold;
  return (1 - (1 - perBooster) ** pityThreshold) / perBooster;
}

/** Au-delà, la pitié est considérée hors d'atteinte (seuil désactivé). */
const MAX_PITY_STATES = 100_000;

/**
 * Taux moyen de boosters avec au moins une Mythique sur le long terme, pitié, doré et divin compris.
 * Chaîne de Markov : état = pitié avant le booster × position dans le cycle doré. La position avance
 * de façon déterministe, donc on itère cycle par cycle jusqu'à stabilisation.
 */
export function longRunMythicRate(rules: DrawRules): number {
  const T = rules.pityThreshold;
  const G = rules.goldenEvery > 0 ? rules.goldenEvery : 1;
  const golden = (c: number) => rules.goldenEvery > 0 && (c + 1) % G === 0;
  const d = rules.divineOdds > 0 ? 1 / rules.divineOdds : 0;
  const mythicIn = (g: boolean) =>
    atLeastOdds(rules.rates, floorsFor(rules.slotFloors, { golden: g, divine: false, goldenFloor: rules.goldenFloor }))
      .MYTHIC;
  const qNormal = mythicIn(false);
  const qGolden = mythicIn(true);
  const baseAt = (c: number) => d + (1 - d) * (golden(c) ? qGolden : qNormal);

  // Pitié hors d'atteinte (type qui n'y compte pas) : simple moyenne sur le cycle doré
  if (T > MAX_PITY_STATES) {
    let sum = 0;
    for (let c = 0; c < G; c++) sum += baseAt(c);
    return sum / G;
  }

  let dist = new Float64Array(T);
  dist[0] = 1;
  let rate = 0;
  // Borne de calcul : jamais plus de ~50 M d'opérations, même avec des réglages extrêmes
  const maxCycles = Math.max(50, Math.floor(50_000_000 / (G * T)));
  for (let cycle = 0; cycle < maxCycles; cycle++) {
    const start = dist;
    let mythics = 0;
    for (let c = 0; c < G; c++) {
      const base = baseAt(c);
      const next = new Float64Array(T);
      for (let p = 0; p < T; p++) {
        const mass = dist[p];
        if (mass === 0) continue;
        const q = p + 1 >= T ? 1 : base;
        mythics += mass * q;
        next[0] += mass * q;
        if (p + 1 < T) next[p + 1] += mass * (1 - q);
      }
      dist = next;
    }
    rate = mythics / G;
    // Stabilisé quand la répartition de la pitié ne bouge plus d'un cycle à l'autre
    // (le total de Mythiques par cycle, lui, reste identique tant que la pitié n'est pas atteinte)
    let moved = 0;
    for (let p = 0; p < T; p++) moved += Math.abs(dist[p] - start[p]);
    if (moved < 1e-12) return rate;
  }
  return rate;
}

export type BoosterChances = {
  /** Booster normal (sans pitié, doré ni divin) : P(au moins une carte ≥ R). */
  atLeast: RarityOdds;
  /** Part de boosters avec une Mythique sur le long terme, bonus compris. */
  mythicRate: number;
  /** Écart moyen entre deux Mythiques, en boosters. */
  meanGap: number;
};

export function boosterChances(rules: DrawRules): BoosterChances {
  const mythicRate = longRunMythicRate(rules);
  return {
    atLeast: atLeastOdds(rules.rates, rules.slotFloors),
    mythicRate,
    meanGap: mythicRate > 0 ? 1 / mythicRate : Infinity,
  };
}

/** Mythiques par jour pour un joueur qui ouvre tous ses boosters gratuits. */
export function mythicsPerDay(mythicRate: number, intervalMinutes: number): number {
  return mythicRate * ((24 * 60) / intervalMinutes);
}
