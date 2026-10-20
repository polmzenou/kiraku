import { floorsFor, resolvePoolRarity, type CardPool, type DrawRules, type FeaturedDraw } from "@/lib/boosters/draw";
import { rolledDistribution } from "@/lib/boosters/odds";

export type OddsScenario = "normal" | "golden" | "divine" | "pity";
type Distribution = Map<number, number>;
const add = (map: Distribution, mask: number, p: number) => map.set(mask, (map.get(mask) ?? 0) + p);
// Three flags summarize each draw: target card, Mythic-or-higher, featured. No Monte Carlo.
export function cardOdds(input: { targetId: string; pool: CardPool; rules: DrawRules; featured?: FeaturedDraw;
  scenario: OddsScenario; pityEligible: boolean; bonusEligible: boolean; featuredPity?: boolean }) {
  const { targetId, pool, rules, featured } = input;
  const order = rules.rarities ?? Object.keys(rules.rates);
  const weights = rules.cardWeights ?? {};
  const featuredIds = new Set(Object.values(featured?.byRarity ?? {}).flat());
  const maskFor = (id: string, rarity: string) => (id === targetId ? 1 : 0) |
    (order.indexOf(rarity) >= order.indexOf("MYTHIC") ? 2 : 0) | (featuredIds.has(id) ? 4 : 0);
  const weighted = (items: { id: string; rarity: string }[]): Distribution => {
    const out: Distribution = new Map();
    const total = items.reduce((s, c) => s + (weights[c.id] ?? 1), 0);
    if (total > 0) for (const c of items) add(out, maskFor(c.id, c.rarity), (weights[c.id] ?? 1) / total);
    return out;
  };
  const normalPick = (rarity: string) => {
    const i = Math.max(0, order.indexOf(rarity));
    for (const r of [...order.slice(0, i + 1).reverse(), ...order.slice(i + 1)]) {
      const ids = (pool[r] ?? []).filter((id) => (weights[id] ?? 1) > 0);
      if (ids.length) return weighted(ids.map((id) => ({ id, rarity: r })));
    }
    return new Map<number, number>();
  };
  const floors = floorsFor(rules.slotFloors, { golden: input.scenario === "golden" && input.bonusEligible,
    divine: input.scenario === "divine" && input.bonusEligible, goldenFloor: rules.goldenFloor, rarities: order });
  if (!floors.length || !Object.values(pool).some((ids) => ids.some((id) => (weights[id] ?? 1) > 0))) return { perSlot: floors.map(() => 0), atLeast: 0 };
  const slots = floors.map((floor) => {
    const out: Distribution = new Map();
    for (const [r, chance] of Object.entries(rolledDistribution(rules.rates, floor))) {
      if (!chance) continue;
      const served = resolvePoolRarity(pool, r, weights, order);
      const direct = weighted((featured?.byRarity[served] ?? []).map((id) => ({ id, rarity: served })));
      const share = direct.size ? (featured!.rate / 10_000) : 0;
      for (const [mask, p] of normalPick(r)) add(out, mask, chance * (1 - share) * p);
      for (const [mask, p] of direct) add(out, mask, chance * share * p);
    }
    return out;
  });
  const perSlot = slots.map((dist) => [...dist].reduce((s, [m, p]) => s + (m & 1 ? p : 0), 0));
  let prefix: Distribution = new Map([[0, 1]]);
  for (const slot of slots.slice(0, -2)) {
    const next: Distribution = new Map();
    for (const [a, p] of prefix) for (const [b, q] of slot) add(next, a | b, p * q);
    prefix = next;
  }
  const n = slots.length;
  const penultimate = n > 1 ? slots[n - 2] : new Map([[0, 1]]);
  const pity = normalPick("MYTHIC");
  const featuredAll = weighted(Object.entries(featured?.byRarity ?? {}).flatMap(([rarity, ids]) => ids.map((id) => ({ id, rarity }))));
  let atLeast = 0, lastChance = 0, penultimateChance = 0;
  for (const [a, pa] of prefix) for (const [b, pb] of penultimate) for (const [c, pc] of slots[n - 1]) {
    const forcePity = input.scenario === "pity" && input.pityEligible && !((a | b | c) & 2);
    for (const [last, pl] of forcePity ? pity : new Map([[c, 1]])) {
      const forceFeatured = input.featuredPity && featuredAll.size > 0 && !((a | b | last) & 4);
      for (const [forced, pf] of forceFeatured ? featuredAll : new Map([[0, 1]])) {
        const replacePenultimate = forceFeatured && forcePity && n > 1;
        const finalB = replacePenultimate ? forced : b;
        const finalC = forceFeatured && !replacePenultimate ? forced : last;
        const p = pa * pb * pc * pl * pf;
        if ((a | finalB | finalC) & 1) atLeast += p;
        if (finalB & 1) penultimateChance += p;
        if (finalC & 1) lastChance += p;
      }
    }
  }
  perSlot[n - 1] = lastChance;
  if (n > 1) perSlot[n - 2] = penultimateChance;
  return { perSlot, atLeast: Math.max(0, Math.min(1, atLeast)) };
}
