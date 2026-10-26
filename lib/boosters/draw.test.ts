import { describe, expect, it } from "vitest";
import { RARITIES, type Rarity } from "@/lib/catalog/rarity";
import {
  apocalypseSparedShare,
  boostersUntilGolden,
  boostersUntilPity,
  buildRarityTables,
  capRates,
  drawBoosters,
  drawSealed,
  featuredFromPool,
  floorsFor,
  pickCard,
  rarityIndex,
  rollDrop,
  rollRarity,
} from "./draw";
import { DEFAULT_RULES, DEFAULT_RUIN, fakePool, NO_BONUS } from "./fixtures";
import { seededRng, type Rng } from "./rng";

const rates = DEFAULT_RULES.rates;
const tables = buildRarityTables(rates);

/** Toutes les valeurs possibles du hasard, une par une : compte exact, sans statistique. */
function enumerate(floor: Rarity) {
  const counts = Object.fromEntries(Object.keys(rates).map((r) => [r, 0])) as Record<Rarity, number>;
  const { total } = tables[floor];
  for (let x = 0; x < total; x++) counts[rollRarity(() => x, tables, floor)] += 1;
  return { counts, total };
}

describe("rollRarity : correspondance exacte avec le tableau des parts", () => {
  it("sans plancher, chaque rareté reçoit exactement sa part (total 99 975)", () => {
    const { counts, total } = enumerate("COMMON");
    expect(total).toBe(99_975);
    // AR et Gold prennent 10 des 25 parts Mythique : « Mythique ou mieux » reste à 25.
    expect(counts).toEqual({ COMMON: 62_000, UNCOMMON: 25_000, RARE: 11_400, EPIC: 1_400, LEGENDARY: 150, MYTHIC: 15, AR: 8, GOLD: 2 });
  });

  it.each(RARITIES)("plancher %s : jamais en dessous, parts du dessus inchangées", (floor) => {
    const { counts } = enumerate(floor);
    for (const r of RARITIES) {
      expect(counts[r]).toBe(rarityIndex(r) < rarityIndex(floor) ? 0 : rates[r]);
    }
  });

  it("un plancher dont toutes les parts sont nulles donne le plancher lui-même", () => {
    const t = buildRarityTables({ ...rates, MYTHIC: 0, AR: 0, GOLD: 0 });
    expect(rollRarity(() => 0, t, "MYTHIC")).toBe("MYTHIC");
  });
});

describe("floorsFor", () => {
  const slots = DEFAULT_RULES.slotFloors;

  it("booster normal : C · C · U+ · R+", () => {
    expect(floorsFor(slots, { golden: false, divine: false, goldenFloor: "EPIC" })).toEqual([
      "COMMON",
      "COMMON",
      "UNCOMMON",
      "RARE",
    ]);
  });

  it("doré : la dernière carte passe en Épique+", () => {
    expect(floorsFor(slots, { golden: true, divine: false, goldenFloor: "EPIC" })).toEqual([
      "COMMON",
      "COMMON",
      "UNCOMMON",
      "EPIC",
    ]);
  });

  it("doré ne rabaisse jamais un plancher plus haut", () => {
    expect(floorsFor(["MYTHIC"], { golden: true, divine: false, goldenFloor: "EPIC" })).toEqual(["MYTHIC"]);
  });

  it("divin : tout Épique+, dernière Mythique", () => {
    expect(floorsFor(slots, { golden: true, divine: true, goldenFloor: "EPIC" })).toEqual([
      "EPIC",
      "EPIC",
      "EPIC",
      "MYTHIC",
    ]);
  });
});

describe("pickCard", () => {
  it("tire dans le palier demandé", () => {
    expect(pickCard(() => 3, fakePool(), "EPIC")).toEqual({ cardId: "EPIC-3", rarity: "EPIC" });
  });

  it("un palier vide descend au palier inférieur", () => {
    expect(pickCard(() => 0, fakePool(5, ["MYTHIC", "LEGENDARY"]), "MYTHIC").rarity).toBe("EPIC");
  });

  it("remonte si tout ce qui est en dessous est vide", () => {
    expect(pickCard(() => 0, fakePool(5, ["COMMON"]), "COMMON").rarity).toBe("UNCOMMON");
  });

  it("échoue sur un pool entièrement vide", () => {
    expect(() => pickCard(() => 0, fakePool(0), "RARE")).toThrow("EMPTY_POOL");
  });
});

/** Hasard qui ne donne jamais de Mythique ni de divin : 0 tombe toujours sur la rareté la plus basse. */
const lowest: Rng = () => 0;

describe("drawBoosters", () => {
  const pool = fakePool();
  const noBonus = { ...DEFAULT_RULES, ...NO_BONUS };

  it("même graine, même tirage", () => {
    const a = drawBoosters(seededRng(42), { pool, rules: DEFAULT_RULES, state: { pityCount: 0, standardCount: 0 }, count: 10 });
    const b = drawBoosters(seededRng(42), { pool, rules: DEFAULT_RULES, state: { pityCount: 0, standardCount: 0 }, count: 10 });
    expect(a).toEqual(b);
  });

  it("chaque booster a autant de cartes que d'emplacements, chacune au-dessus de son plancher", () => {
    const { boosters } = drawBoosters(seededRng(7), { pool, rules: noBonus, state: { pityCount: 0, standardCount: 0 }, count: 500 });
    for (const b of boosters) {
      expect(b.cards).toHaveLength(4);
      b.cards.forEach((c, i) => expect(rarityIndex(c.rarity)).toBeGreaterThanOrEqual(rarityIndex(noBonus.slotFloors[i])));
    }
  });

  it("pitié : le 250e booster sans Mythique en donne une, pas avant", () => {
    const rules = { ...noBonus };
    const before = drawBoosters(lowest, { pool, rules, state: { pityCount: 247, standardCount: 0 }, count: 1 });
    expect(before.boosters[0].pityTriggered).toBe(false);
    expect(before.state.pityCount).toBe(248);

    const at = drawBoosters(lowest, { pool, rules, state: { pityCount: 249, standardCount: 0 }, count: 1 });
    expect(at.boosters[0].pityTriggered).toBe(true);
    expect(at.boosters[0].cards.at(-1)!.rarity).toBe("MYTHIC");
    expect(at.state.pityCount).toBe(0);
  });

  it("pitié : une Mythique tirée normalement remet le compteur à zéro", () => {
    // Le plus grand entier tombe toujours sur la rareté la plus haute
    const highest: Rng = (max) => max - 1;
    const r = drawBoosters(highest, { pool, rules: noBonus, state: { pityCount: 120, standardCount: 0 }, count: 1 });
    expect(r.boosters[0].pityTriggered).toBe(false);
    expect(r.state.pityCount).toBe(0);
  });

  it("doré : exactement un booster sur 10, dernière carte Épique+", () => {
    const rules = { ...DEFAULT_RULES, divineOdds: 0, apocalypseOdds: 0 };
    const { boosters, state } = drawBoosters(lowest, { pool, rules, state: { pityCount: 0, standardCount: 3 }, count: 30 });
    const golden = boosters.flatMap((b, i) => (b.golden ? [i] : []));
    expect(golden).toEqual([6, 16, 26]); // 10e, 20e, 30e booster du joueur
    for (const i of golden) expect(boosters[i].cards.at(-1)!.rarity).toBe("EPIC");
    expect(state.standardCount).toBe(33);
  });

  it("sachet Divin : le booster se transforme, sans cartes, et ne fait avancer aucun compteur", () => {
    const rules = { ...DEFAULT_RULES, goldenEvery: 0, divineOdds: 1 }; // 1 chance sur 1 : toujours un Divin
    const { boosters, state } = drawBoosters(lowest, { pool, rules, state: { pityCount: 249, standardCount: 4 }, count: 3 });
    for (const b of boosters) {
      expect(b.drop).toBe("divin");
      expect(b.cards).toEqual([]);
      expect(b.pityTriggered).toBe(false);
    }
    expect(state).toMatchObject({ pityCount: 249, standardCount: 4 });
  });

  it("sachet Apocalyptique : seulement quand le Divin n'est pas tombé, jamais les deux", () => {
    const rules = { ...DEFAULT_RULES, goldenEvery: 0, divineOdds: 2, apocalypseOdds: 1 };
    // Divin tiré à 1 (raté), puis Apocalyptique à 0 (réussi)
    const values = [1, 0];
    const rng: Rng = () => values.shift() ?? 0;
    const { boosters } = drawBoosters(rng, { pool, rules, state: { pityCount: 0, standardCount: 0 }, count: 1 });
    expect(boosters[0].drop).toBe("apocalypse");
    expect(rollDrop(() => 0, rules)).toBe("divin");
    expect(rollDrop(() => 1, { divineOdds: 2, apocalypseOdds: 2 })).toBeNull();
    expect(rollDrop(() => 0, { divineOdds: 0, apocalypseOdds: 0 })).toBeNull();
  });

  it("un booster doré ne se transforme jamais, et le doré attend le booster suivant", () => {
    const rules = { ...DEFAULT_RULES, divineOdds: 1, apocalypseOdds: 0 };
    // standardCount 9 : le prochain booster compté est doré, quel que soit le hasard
    const { boosters, state } = drawBoosters(lowest, { pool, rules, state: { pityCount: 0, standardCount: 9 }, count: 2 });
    expect(boosters[0]).toMatchObject({ golden: true, drop: null });
    expect(boosters[0].cards.at(-1)!.rarity).toBe("EPIC");
    expect(boosters[1].drop).toBe("divin");
    expect(state.standardCount).toBe(10);
  });
});

describe("sachets scellés", () => {
  const pool = fakePool();
  const order = Object.keys(rates);
  const atLeast = (r: Rarity, min: Rarity) => rarityIndex(r, order) >= rarityIndex(min, order);

  it("Divin : tout Épique ou mieux, dernière carte Mythique ou mieux, karma inchangé", () => {
    for (let seed = 0; seed < 50; seed++) {
      const { cards, outcome, karma } = drawSealed(seededRng(seed), { kind: "divin", pool, rules: DEFAULT_RULES, ruin: DEFAULT_RUIN, karma: 1 });
      expect(cards).toHaveLength(4);
      expect(cards.every((c) => atLeast(c.rarity, "EPIC"))).toBe(true);
      expect(atLeast(cards.at(-1)!.rarity, "MYTHIC")).toBe(true);
      expect(outcome).toBeNull();
      expect(karma).toBe(1);
    }
  });

  it("Apocalyptique épargné : contenu d'un Divin, karma remis à zéro", () => {
    const { cards, outcome, karma } = drawSealed(lowest, { kind: "apocalypse", pool, rules: DEFAULT_RULES, ruin: DEFAULT_RUIN, karma: 1 });
    expect(outcome).toBe("SPARED");
    expect(cards.at(-1)!.rarity).toBe("MYTHIC");
    expect(karma).toBe(0);
  });

  it("Apocalyptique ruiné : Communes et Peu communes seulement, karma + 1", () => {
    const highest: Rng = (max) => max - 1; // pile ou face raté, puis la rareté la plus haute permise
    const { cards, outcome, karma } = drawSealed(highest, { kind: "apocalypse", pool, rules: DEFAULT_RULES, ruin: DEFAULT_RUIN, karma: 0 });
    expect(outcome).toBe("RUINED");
    expect(cards).toHaveLength(DEFAULT_RUIN.floors.length);
    expect(cards.every((c) => !atLeast(c.rarity, "RARE"))).toBe(true);
    expect(cards.at(-1)!.rarity).toBe("UNCOMMON");
    expect(karma).toBe(1);
  });

  it("le plafond tient même si les paliers du dessous sont vides", () => {
    const highest: Rng = (max) => max - 1;
    const { cards } = drawSealed(highest, { kind: "apocalypse", pool: fakePool(5, ["COMMON"]), rules: DEFAULT_RULES, ruin: DEFAULT_RUIN, karma: 0 });
    expect(cards.every((c) => c.rarity === "UNCOMMON")).toBe(true);
  });

  it("karma : au seuil, l'Apocalyptique est forcément épargné", () => {
    const highest: Rng = (max) => max - 1;
    const rules = { ...DEFAULT_RULES, apocalypseKarma: 2 };
    expect(drawSealed(highest, { kind: "apocalypse", pool, rules, ruin: DEFAULT_RUIN, karma: 1 }).outcome).toBe("RUINED");
    expect(drawSealed(highest, { kind: "apocalypse", pool, rules, ruin: DEFAULT_RUIN, karma: 2 })).toMatchObject({ outcome: "SPARED", karma: 0 });
    // Sans karma, rien n'est forcé
    expect(drawSealed(highest, { kind: "apocalypse", pool, rules: { ...rules, apocalypseKarma: 0 }, ruin: DEFAULT_RUIN, karma: 9 }).outcome).toBe("RUINED");
  });

  it("part épargnée sur le long terme : 50 % sans karma, 1 / 1,75 avec un karma de 2", () => {
    expect(apocalypseSparedShare(5000, 0)).toBe(0.5);
    expect(apocalypseSparedShare(5000, 2)).toBeCloseTo(1 / 1.75, 12);
    expect(apocalypseSparedShare(0, 2)).toBeCloseTo(1 / 3, 12);
    expect(apocalypseSparedShare(10_000, 2)).toBe(1);
  });

  it("capRates retire les parts au-dessus du plafond", () => {
    expect(capRates(rates, "UNCOMMON")).toEqual({ ...rates, RARE: 0, EPIC: 0, LEGENDARY: 0, MYTHIC: 0, AR: 0, GOLD: 0 });
  });
});

describe("bonus selon le type", () => {
  const pool = fakePool();
  const none = { golden: false, drop: false, pity: false };

  it("booster de rareté : jamais doré ni sachet scellé, pitié et compteur doré inchangés", () => {
    const rules = { ...DEFAULT_RULES, divineOdds: 1, slotFloors: ["RARE", "RARE", "RARE", "RARE"] as Rarity[] };
    const { boosters, state } = drawBoosters(lowest, {
      pool,
      rules,
      bonuses: none,
      state: { pityCount: 249, standardCount: 9 },
      count: 5,
    });
    for (const b of boosters) {
      expect(b.golden).toBe(false);
      expect(b.drop).toBeNull();
      expect(b.pityTriggered).toBe(false);
    }
    expect(state).toMatchObject({ pityCount: 249, standardCount: 9 });
  });

  it("format : compte pour la pitié mais pas pour le doré", () => {
    const { boosters, state } = drawBoosters(lowest, {
      pool,
      rules: { ...DEFAULT_RULES, slotFloors: ["COMMON", "UNCOMMON"] },
      bonuses: { golden: false, drop: false, pity: true },
      state: { pityCount: 249, standardCount: 9 },
      count: 1,
    });
    expect(boosters[0].golden).toBe(false);
    expect(boosters[0].pityTriggered).toBe(true);
    expect(boosters[0].cards.at(-1)!.rarity).toBe("MYTHIC");
    expect(state).toMatchObject({ pityCount: 0, standardCount: 9 });
  });

  it("un booster Mythique contient toujours une Mythique ou mieux", () => {
    const rules = { ...DEFAULT_RULES, slotFloors: ["EPIC", "EPIC", "EPIC", "MYTHIC"] as Rarity[] };
    const order = Object.keys(rates);
    const { boosters } = drawBoosters(seededRng(3), { pool, rules, bonuses: none, state: { pityCount: 0, standardCount: 0 }, count: 200 });
    for (const b of boosters) expect(b.cards.some((c) => rarityIndex(c.rarity, order) >= rarityIndex("MYTHIC", order))).toBe(true);
  });
});

describe("bannière vedette", () => {
  // Sans carte AR ni Gold publiée : ces tirages retombent sur Mythique et gardent la part vedette.
  const pool = fakePool(10, ["AR", "GOLD"]);
  const featured = featuredFromPool(["MYTHIC-0", "LEGENDARY-1"], pool, { rate: 10_000, pityThreshold: 100 })!;
  const noBonus = { ...DEFAULT_RULES, ...NO_BONUS };

  it("range les vedettes par rareté d'après le pool, ignore celles hors pool", () => {
    expect(featured.byRarity.MYTHIC).toEqual(["MYTHIC-0"]);
    expect(featured.byRarity.LEGENDARY).toEqual(["LEGENDARY-1"]);
    expect(featuredFromPool(["inconnue"], pool, { rate: 5000, pityThreshold: 100 })).toBeUndefined();
  });

  it("taux 100 % : chaque Mythique tirée est la vedette", () => {
    const highest: Rng = (max) => max - 1;
    const { boosters } = drawBoosters(highest, { pool, rules: noBonus, featured, state: { pityCount: 0, standardCount: 0 }, count: 1 });
    const mythics = boosters[0].cards.filter((c) => c.rarity === "MYTHIC");
    expect(mythics.length).toBeGreaterThan(0);
    for (const c of mythics) expect(c).toMatchObject({ cardId: "MYTHIC-0", featured: true });
    expect(boosters[0].featuredHit).toBe(true);
  });

  it("pitié vedette : au 100e booster sans vedette, une vedette est forcée, jamais après", () => {
    const { boosters, state } = drawBoosters(lowest, {
      pool,
      rules: noBonus,
      featured,
      state: { pityCount: 0, standardCount: 0, featuredCount: 97 },
      count: 3,
    });
    expect(boosters.map((b) => b.featuredPityTriggered)).toEqual([false, false, true]);
    expect(boosters[2].cards.at(-1)!.featured).toBe(true);
    expect(state.featuredCount).toBe(0);
  });

  it("pitiés Mythique et vedette le même booster : la vedette prend l'avant-dernière carte", () => {
    const { boosters } = drawBoosters(lowest, {
      pool,
      rules: noBonus,
      featured: { ...featured, byRarity: { ...featured.byRarity, MYTHIC: [] } },
      state: { pityCount: 249, standardCount: 0, featuredCount: 99 },
      count: 1,
    });
    const b = boosters[0];
    expect(b.pityTriggered).toBe(true);
    expect(b.featuredPityTriggered).toBe(true);
    expect(b.cards.at(-1)!.rarity).toBe("MYTHIC");
    expect(b.cards.at(-2)!.featured).toBe(true);
  });

  it("sans bannière, aucune carte n'est marquée vedette", () => {
    const { boosters } = drawBoosters(seededRng(9), { pool, rules: noBonus, state: { pityCount: 0, standardCount: 0 }, count: 50 });
    expect(boosters.every((b) => !b.featuredHit && b.cards.every((c) => !c.featured))).toBe(true);
  });
});

describe("compteurs affichés", () => {
  it("boosters avant le doré", () => {
    expect(boostersUntilGolden(0, 10)).toBe(10);
    expect(boostersUntilGolden(9, 10)).toBe(1);
    expect(boostersUntilGolden(10, 10)).toBe(10);
    expect(boostersUntilGolden(4, 0)).toBeNull();
  });

  it("boosters avant la Mythique garantie", () => {
    expect(boostersUntilPity(0, 250)).toBe(250);
    expect(boostersUntilPity(249, 250)).toBe(1);
  });
});
