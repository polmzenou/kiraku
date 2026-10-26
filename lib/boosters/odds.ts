import { RARITIES, type Rarity } from "@/lib/catalog/rarity";
import { apocalypseSparedShare, floorsFor, ratesFrom, rarityIndex, type DrawBonuses, type DrawRules, type RarityRates } from "./draw";

// Probabilités exactes (sans hasard) d'un booster : affichées dans le panneau « Chance par booster »,
// dans l'aperçu d'impact de l'admin, et comparées à la simulation dans les tests.

export type RarityOdds = Record<Rarity, number>;

const zeroOdds = (order: readonly string[] = RARITIES): RarityOdds => Object.fromEntries(order.map((r) => [r, 0])) as RarityOdds;

/** Nombre de cartes par rareté dans le pool d'un type (un palier vide se replie au tirage). */
export type PoolCounts = Readonly<Record<Rarity, number>>;

/** Rareté réellement obtenue quand on tire `r` : même repli que pickCard (descend, puis remonte). */
export function resolveRarity(r: Rarity, counts?: PoolCounts, rarities?: readonly string[]): Rarity {
  if (!counts) return r;
  const order = rarities ?? Object.keys(counts);
  const i = order.indexOf(r);
  const fallback = [...order.slice(0, i + 1).reverse(), ...order.slice(i + 1)];
  return fallback.find((x) => counts[x] > 0) ?? r;
}

/** Rareté tirée (avant repli) pour un emplacement de plancher `floor`. */
export function rolledDistribution(rates: RarityRates, floor: Rarity): RarityOdds {
  const table = ratesFrom(rates, floor);
  const total = table.reduce((s, [, w]) => s + w, 0);
  const odds = zeroOdds(Object.keys(rates));
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
  const odds = zeroOdds(Object.keys(rates));
  for (const r of Object.keys(rates)) odds[resolveRarity(r, counts, Object.keys(rates))] += rolled[r];
  return odds;
}

/** P(au moins une carte de rareté ≥ R dans le booster), pour chaque R. */
export function atLeastOdds(rates: RarityRates, floors: readonly Rarity[], counts?: PoolCounts): RarityOdds {
  const slots = floors.map((f) => slotDistribution(rates, f, counts));
  const order = Object.keys(rates);
  const result = zeroOdds(order);
  for (const target of order) {
    const t = rarityIndex(target, order);
    const none = slots.reduce((p, slot) => {
      const atLeast = order.reduce((s, r) => (rarityIndex(r, order) >= t ? s + slot[r] : s), 0);
      return p * (1 - atLeast);
    }, 1);
    result[target] = 1 - none;
  }
  return result;
}

/** Règles d'un type : sans doré ni sachets scellés s'il n'y a pas droit, sans pitié s'il n'y compte pas. */
export function rulesWithBonuses(rules: DrawRules, bonuses: DrawBonuses): DrawRules {
  return {
    ...rules,
    goldenEvery: bonuses.golden ? rules.goldenEvery : 0,
    divineOdds: bonuses.drop ? rules.divineOdds : 0,
    apocalypseOdds: bonuses.drop ? rules.apocalypseOdds : 0,
    pityThreshold: bonuses.pity ? rules.pityThreshold : Number.MAX_SAFE_INTEGER,
  };
}

/**
 * Part des boosters ouverts qui se transforment en sachet Divin ou Apocalyptique. Un booster doré ne
 * se transforme jamais et un booster transformé n'avance pas le doré : sur un cycle de G boosters
 * comptés, les G − 1 places non dorées donnent chacune q / (1 − q) chutes en moyenne.
 */
export function dropRates(rules: Pick<DrawRules, "divineOdds" | "apocalypseOdds" | "goldenEvery">): { divin: number; apocalypse: number } {
  const pd = rules.divineOdds > 0 ? 1 / rules.divineOdds : 0;
  const pa = rules.apocalypseOdds > 0 ? 1 / rules.apocalypseOdds : 0;
  const q = pd + (1 - pd) * pa;
  if (q <= 0) return { divin: 0, apocalypse: 0 };
  if (q >= 1) return { divin: pd, apocalypse: 1 - pd };
  const G = rules.goldenEvery;
  const perCounted = q / (1 - q);
  const rate = G > 0 ? ((G - 1) * perCounted) / (G + (G - 1) * perCounted) : q;
  return { divin: (rate * pd) / q, apocalypse: (rate * (1 - pd) * pa) / q };
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
  for (const r of Object.keys(rates)) {
    if (rolled[r] === 0) continue;
    const res = resolveRarity(r, input.counts, Object.keys(rates));
    const direct = input.featured[res] > 0 ? share : 0;
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
 * Taux moyen de boosters avec au moins une Mythique sur le long terme, pitié, doré et sachets scellés
 * compris (un sachet ouvert compte pour le booster d'où il est tombé : un Divin ou un Apocalyptique
 * épargné a toujours une Mythique ou mieux).
 */
export function longRunMythicRate(rules: DrawRules): number {
  const drops = dropRates(rules);
  const counted = 1 - drops.divin - drops.apocalypse;
  return counted * countedMythicRate(rules) + drops.divin + drops.apocalypse * apocalypseSparedShare(rules.apocalypseWinRate, rules.apocalypseKarma);
}

/**
 * Même taux sur les seuls boosters qui donnent des cartes (les boosters transformés ne font avancer
 * ni la pitié ni le doré). Chaîne de Markov : état = pitié avant le booster × position dans le cycle
 * doré. La position avance de façon déterministe, donc on itère cycle par cycle jusqu'à stabilisation.
 */
function countedMythicRate(rules: DrawRules): number {
  const T = rules.pityThreshold;
  const G = rules.goldenEvery > 0 ? rules.goldenEvery : 1;
  const golden = (c: number) => rules.goldenEvery > 0 && (c + 1) % G === 0;
  const mythicIn = (g: boolean) =>
    atLeastOdds(rules.rates, floorsFor(rules.slotFloors, { golden: g, divine: false, goldenFloor: rules.goldenFloor, rarities: rules.rarities ?? Object.keys(rules.rates) }))
      .MYTHIC;
  const qNormal = mythicIn(false);
  const qGolden = mythicIn(true);
  const baseAt = (c: number) => (golden(c) ? qGolden : qNormal);

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
  /** Booster normal (sans pitié, doré ni sachet scellé) : P(au moins une carte ≥ R). */
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
