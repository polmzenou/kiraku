import type { SealedKind } from "@/lib/boosters/draw";
import type { CardView, DroppedSealedView, OpenedBoosterView, OpenedCardView } from "@/lib/boosters/view";
import type { Rarity } from "@/lib/catalog/rarity";

// Banc de test de l'ouverture (admin) : tirages factices, jamais envoyés au serveur ni enregistrés.

export const OPENING_TEST_SCENARIOS = ["all", "mythic", "ar", "gold", "none", "dropDivin", "dropApocalypse"] as const;
export type OpeningTestScenario = (typeof OPENING_TEST_SCENARIOS)[number];

/** Grosses cartes de chaque scénario ; « none » finit sur une Légendaire, qui n'allume pas l'aurore. */
const FINALE: Record<OpeningTestScenario, Rarity[]> = {
  all: ["MYTHIC", "AR", "GOLD"],
  mythic: ["MYTHIC"],
  ar: ["AR"],
  gold: ["GOLD"],
  none: ["LEGENDARY"],
  dropDivin: ["LEGENDARY"],
  dropApocalypse: ["LEGENDARY"],
};

/** Sachet scellé qui tombe dans le scénario (le dernier booster se transforme), sinon null. */
export function testDrop(scenario: OpeningTestScenario, run: number): DroppedSealedView | null {
  if (scenario !== "dropDivin" && scenario !== "dropApocalypse") return null;
  return { id: `test-drop-${run}`, kind: scenario === "dropDivin" ? "divin" : "apocalypse", position: 0 };
}

/**
 * Ouverture factice d'un sachet scellé : Divin (Épiques puis une Mythique ou mieux), ou Apocalyptique
 * épargné un essai sur deux et ruiné l'autre (Communes et Peu communes).
 */
export function testSealedBooster(pool: OpeningTestPool, kind: SealedKind, run: number): OpenedBoosterView {
  const apocalypse = kind === "apocalypse" ? (run % 2 ? "RUINED" : "SPARED") : null;
  const rarities: Rarity[] = apocalypse === "RUINED" ? ["COMMON", "COMMON", "COMMON", "UNCOMMON"] : ["EPIC", "EPIC", "LEGENDARY", run % 3 ? "MYTHIC" : "AR"];
  const cards = rarities.flatMap((rarity, i): OpenedCardView[] => {
    const card = pick(pool, rarity, run * 4 + i);
    return card ? [{ ...card, userCardId: `test-sealed-${run}-${i}`, isNew: i % 2 === 0, featured: false }] : [];
  });
  return {
    id: `test-sealed-${run}`,
    golden: false,
    divine: apocalypse !== "RUINED",
    sealed: kind,
    apocalypse,
    pityTriggered: false,
    featuredHit: false,
    featuredPityTriggered: false,
    zeniSpent: 0,
    cards,
  };
}
/** Remplissage d'un booster, dans l'ordre (la révélation retrie de toute façon par rareté). */
const FILLER: Rarity[] = ["COMMON", "UNCOMMON", "COMMON", "RARE", "UNCOMMON", "EPIC", "COMMON", "RARE", "COMMON", "UNCOMMON"];

/** Cartes disponibles par rareté (lues en base par la page). */
export type OpeningTestPool = Partial<Record<Rarity, CardView[]>>;

/** Carte de la rareté voulue ; à défaut en base, une autre carte réétiquetée (aperçu visuel seulement). */
function pick(pool: OpeningTestPool, rarity: Rarity, n: number): CardView | null {
  const own = pool[rarity];
  const list = own?.length ? own : (pool.MYTHIC?.length ? pool.MYTHIC : Object.values(pool).find((cards) => cards?.length));
  const card = list?.[n % list.length];
  return card ? { ...card, rarity } : null;
}

/**
 * `count` boosters de `cardsPerBooster` cartes : les grosses cartes du scénario sont réparties en
 * partant du dernier booster, le reste est du remplissage. Ids uniques par essai (`run`).
 */
export function testBoosters({ pool, scenario, count, cardsPerBooster, run }: {
  pool: OpeningTestPool;
  scenario: OpeningTestScenario;
  count: number;
  cardsPerBooster: number;
  run: number;
}): OpenedBoosterView[] {
  const size = Math.max(1, cardsPerBooster);
  const finale = FINALE[scenario];
  const slots: Rarity[][] = Array.from({ length: count }, () => []);
  finale.forEach((rarity, i) => {
    const booster = slots[count - 1 - (i % count)];
    if (booster && booster.length < size) booster.push(rarity);
  });
  let n = 0;
  return slots.map((big, b) => {
    const rarities = [...FILLER.slice((b * 3) % FILLER.length), ...FILLER].slice(0, size - big.length).concat(big);
    const cards = rarities.flatMap((rarity, i): OpenedCardView[] => {
      const card = pick(pool, rarity, n++);
      return card ? [{ ...card, userCardId: `test-${run}-${b}-${i}`, isNew: (b + i) % 3 === 0, featured: false }] : [];
    });
    return {
      id: `test-${run}-${b}`,
      golden: false,
      divine: false,
      pityTriggered: false,
      featuredHit: false,
      featuredPityTriggered: false,
      zeniSpent: 0,
      cards,
    };
  });
}
