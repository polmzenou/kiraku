import { describe, expect, it } from "vitest";
import { RARITIES, type Rarity } from "@/lib/catalog/rarity";
import {
  boostersUntilGolden,
  boostersUntilPity,
  buildRarityTables,
  drawBoosters,
  floorsFor,
  pickCard,
  rarityIndex,
  rollRarity,
} from "./draw";
import { DEFAULT_RULES, fakePool } from "./fixtures";
import { seededRng, type Rng } from "./rng";

const rates = DEFAULT_RULES.rates;
const tables = buildRarityTables(rates);

/** Toutes les valeurs possibles du hasard, une par une : compte exact, sans statistique. */
function enumerate(floor: Rarity) {
  const counts = Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>;
  const { total } = tables[floor];
  for (let x = 0; x < total; x++) counts[rollRarity(() => x, tables, floor)] += 1;
  return { counts, total };
}

describe("rollRarity : correspondance exacte avec le tableau des parts", () => {
  it("sans plancher, chaque rareté reçoit exactement sa part (total 99 975)", () => {
    const { counts, total } = enumerate("COMMON");
    expect(total).toBe(99_975);
    expect(counts).toEqual({ COMMON: 62_000, UNCOMMON: 25_000, RARE: 11_400, EPIC: 1_400, LEGENDARY: 150, MYTHIC: 25 });
  });

  it.each(RARITIES)("plancher %s : jamais en dessous, parts du dessus inchangées", (floor) => {
    const { counts } = enumerate(floor);
    for (const r of RARITIES) {
      expect(counts[r]).toBe(rarityIndex(r) < rarityIndex(floor) ? 0 : rates[r]);
    }
  });

  it("un plancher dont toutes les parts sont nulles donne le plancher lui-même", () => {
    const t = buildRarityTables({ ...rates, MYTHIC: 0 });
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
  const noBonus = { ...DEFAULT_RULES, goldenEvery: 0, divineOdds: 0 };

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
    const rules = { ...DEFAULT_RULES, divineOdds: 0 };
    const { boosters, state } = drawBoosters(lowest, { pool, rules, state: { pityCount: 0, standardCount: 3 }, count: 30 });
    const golden = boosters.flatMap((b, i) => (b.golden ? [i] : []));
    expect(golden).toEqual([6, 16, 26]); // 10e, 20e, 30e booster du joueur
    for (const i of golden) expect(boosters[i].cards.at(-1)!.rarity).toBe("EPIC");
    expect(state.standardCount).toBe(33);
  });

  it("divin : tout Épique+ et une Mythique garantie", () => {
    const rules = { ...DEFAULT_RULES, divineOdds: 1 }; // 1 chance sur 1 : toujours divin
    const { boosters } = drawBoosters(lowest, { pool, rules, state: { pityCount: 0, standardCount: 0 }, count: 3 });
    for (const b of boosters) {
      expect(b.divine).toBe(true);
      expect(b.cards.every((c) => rarityIndex(c.rarity) >= rarityIndex("EPIC"))).toBe(true);
      expect(b.cards.at(-1)!.rarity).toBe("MYTHIC");
    }
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
