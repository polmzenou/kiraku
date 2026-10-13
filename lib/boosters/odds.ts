import { RARITIES, type Rarity } from "@/lib/catalog/rarity";
import { floorsFor, ratesFrom, rarityIndex, type DrawRules, type RarityRates } from "./draw";

// Probabilités exactes (sans hasard) d'un booster : affichées dans le panneau « Chance par booster »,
// dans l'aperçu d'impact de l'admin, et comparées à la simulation dans les tests.

export type RarityOdds = Record<Rarity, number>;

const zeroOdds = (): RarityOdds => Object.fromEntries(RARITIES.map((r) => [r, 0])) as RarityOdds;

/** Probabilité de chaque rareté pour un emplacement de plancher `floor`. */
export function slotDistribution(rates: RarityRates, floor: Rarity): RarityOdds {
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

/** P(au moins une carte de rareté ≥ R dans le booster), pour chaque R. */
export function atLeastOdds(rates: RarityRates, floors: readonly Rarity[]): RarityOdds {
  const slots = floors.map((f) => slotDistribution(rates, f));
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

  let dist = new Float64Array(T);
  dist[0] = 1;
  let rate = 0;
  // Borne de calcul : jamais plus de ~50 M d'opérations, même avec des réglages extrêmes
  const maxCycles = Math.max(50, Math.floor(50_000_000 / (G * T)));
  for (let cycle = 0; cycle < maxCycles; cycle++) {
    const start = dist;
    let mythics = 0;
    for (let c = 0; c < G; c++) {
      const base = d + (1 - d) * (golden(c) ? qGolden : qNormal);
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
