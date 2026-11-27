import type { Rng } from "../rng";
import { cellCount, type Grid } from "./grid";
import { missingPositions } from "./progress";

// Chute des fragments de fresque, sans base. Un jet par booster ouvert : à `rate` points de base, un
// fragment tombe ; la fresque est choisie au poids parmi celles qui peuvent tomber de ce booster et que le
// joueur n'a pas finies, puis un fragment qui lui manque, au hasard. Jamais de doublon : une fresque finie
// ne tombe plus pour lui. Le serveur décide de tout (rng = crypto.randomInt) ; les tests passent une graine.

export const RATE_SCALE = 10_000;

export type FrescoCandidate = {
  id: string;
  grid: Grid;
  /** Poids au tirage entre fresques (0 = ne tombe pas). */
  weight: number;
  /** Types de booster d'où elle tombe ; vide = tous. */
  boosterTypeIds: readonly string[];
};

export type FrescoDrop = { frescoId: string; position: number };

/** La fresque peut-elle tomber de ce type de booster ? */
export function dropsFrom(candidate: Pick<FrescoCandidate, "boosterTypeIds">, boosterTypeId: string): boolean {
  return candidate.boosterTypeIds.length === 0 || candidate.boosterTypeIds.includes(boosterTypeId);
}

/**
 * Jets d'une ouverture de `count` boosters du type `boosterTypeId`. `owned` (fresque → positions possédées)
 * est mis à jour au fil des boosters : deux boosters d'une même ouverture ne donnent jamais le même fragment.
 * Renvoie un élément par booster (null quand rien ne tombe).
 */
export function rollFrescoDrops(
  rng: Rng,
  input: {
    count: number;
    rate: number;
    boosterTypeId: string;
    candidates: readonly FrescoCandidate[];
    owned: ReadonlyMap<string, ReadonlySet<number>>;
  },
): (FrescoDrop | null)[] {
  const owned = new Map<string, Set<number>>([...input.owned].map(([id, set]) => [id, new Set(set)]));
  const rate = Math.min(RATE_SCALE, Math.max(0, Math.trunc(input.rate)));
  const eligible = input.candidates.filter((c) => c.weight > 0 && dropsFrom(c, input.boosterTypeId));
  const out: (FrescoDrop | null)[] = [];
  for (let i = 0; i < input.count; i++) {
    // Le jet a toujours lieu, même sans fresque à donner : le hasard des boosters suivants n'en dépend pas
    const hit = rate > 0 && rng(RATE_SCALE) < rate;
    const open = eligible.filter((c) => (owned.get(c.id)?.size ?? 0) < cellCount(c.grid));
    if (!hit || open.length === 0) {
      out.push(null);
      continue;
    }
    const fresco = pickWeighted(rng, open);
    const mine = owned.get(fresco.id) ?? new Set<number>();
    const missing = missingPositions(mine, fresco.grid);
    const position = missing[rng(missing.length)];
    mine.add(position);
    owned.set(fresco.id, mine);
    out.push({ frescoId: fresco.id, position });
  }
  return out;
}

function pickWeighted(rng: Rng, list: readonly FrescoCandidate[]): FrescoCandidate {
  const total = list.reduce((sum, c) => sum + c.weight, 0);
  let n = rng(total);
  for (const c of list) {
    n -= c.weight;
    if (n < 0) return c;
  }
  return list[list.length - 1];
}
