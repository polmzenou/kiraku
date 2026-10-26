import { describe, expect, it } from "vitest";
import { RARITIES } from "@/lib/catalog/rarity";
import { seededRng } from "@/lib/rng";
import { BOT_NAMES, botAction, botRarities, scoreAction } from "./bot";
import { DEFAULT_BATTLE_RULES } from "./config";
import { createState } from "./engine";
import { FLAT_RULES, fighter, setupOf } from "./fixtures";
import { buildSetup, combatStats, firstSide, keywordsFor, techniqueFor } from "./stats";
import { KEYWORDS, TECHNIQUES } from "./types";

const rules = DEFAULT_BATTLE_RULES;

describe("stats de combat", () => {
  it("ATK = 力, DEF = 気, PV = 80 + 1,6 × 気, VIT = moyenne", () => {
    expect(combatStats(100, 86, rules.stats)).toEqual({ atk: 100, def: 86, hp: 217, spd: 93 });
    expect(combatStats(40, 30, rules.stats)).toEqual({ atk: 40, def: 30, hp: 128, spd: 35 });
  });

  it("le camp le plus rapide commence, le hasard tranche les égalités", () => {
    const fast = [fighter({ power: 100, ki: 80 })];
    const slow = [fighter({ power: 40, ki: 30 })];
    expect(firstSide([fast, slow], () => 1)).toBe(0);
    expect(firstSide([slow, fast], () => 0)).toBe(1);
    const tie = [fighter()];
    expect(firstSide([tie, [fighter()]], () => 1)).toBe(1);
  });

  it("un camp imposé commence même s'il est plus lent (joueur contre bot)", () => {
    const fast = [fighter({ power: 100, ki: 80 })];
    const slow = [fighter({ power: 40, ki: 30 })];
    expect(buildSetup([slow, fast], FLAT_RULES, () => 1, 0).first).toBe(0);
    expect(buildSetup([slow, fast], FLAT_RULES, () => 1).first).toBe(1);
  });
});

describe("passifs et techniques", () => {
  it("toujours les mêmes pour un personnage, sans doublon, nombre selon la rareté", () => {
    for (const rarity of RARITIES) {
      for (let id = 1; id < 300; id++) {
        const k = keywordsFor(id, rarity, rules.keywordsByRarity);
        expect(k).toEqual(keywordsFor(id, rarity, rules.keywordsByRarity));
        expect(k).toHaveLength(rules.keywordsByRarity[rarity]);
        expect(new Set(k).size).toBe(k.length);
        k.forEach((kw) => expect(KEYWORDS).toContain(kw));
      }
    }
    expect(techniqueFor(127691)).toBe(techniqueFor(127691));
  });

  it("toutes les techniques et tous les passifs sortent, à peu près à parts égales", () => {
    const tech = new Map<string, number>();
    const kw = new Map<string, number>();
    for (let id = 1; id <= 7_000; id++) {
      tech.set(techniqueFor(id), (tech.get(techniqueFor(id)) ?? 0) + 1);
      for (const k of keywordsFor(id, "RARE", rules.keywordsByRarity)) kw.set(k, (kw.get(k) ?? 0) + 1);
    }
    for (const t of TECHNIQUES) expect(tech.get(t)).toBeGreaterThan(800);
    for (const k of KEYWORDS) expect(kw.get(k)).toBeGreaterThan(800);
  });
});

describe("bot", () => {
  it("garde les raretés du joueur, avec une montée occasionnelle", () => {
    expect(botRarities(["COMMON", "EPIC", "MYTHIC"], () => 99, 10)).toEqual(["COMMON", "EPIC", "MYTHIC"]);
    expect(botRarities(["COMMON", "EPIC", "MYTHIC"], () => 0, 10)).toEqual(["UNCOMMON", "LEGENDARY", "MYTHIC"]);
  });

  it("respecte les paliers personnalisés et ne transforme pas un palier inconnu en Commune", () => {
    const order = [...RARITIES, "CELESTIAL"];
    expect(botRarities(["MYTHIC", "CELESTIAL"], () => 0, 100, order)).toEqual(["CELESTIAL", "CELESTIAL"]);
    expect(botRarities(["UNKNOWN"], () => 0, 100, order)).toEqual(["UNKNOWN"]);
  });

  it("achève une carte plutôt que de taper au hasard", () => {
    const setup = setupOf([fighter({ power: 80 })], [fighter({ ki: 60 }), fighter({ ki: 60 })]);
    const { state } = createState(setup);
    state.fighters[1][1].hp = 20;
    expect(botAction(setup, state, 0, seededRng(1), 0)).toEqual({ type: "ATTACK", side: 0, actor: 0, target: 1 });
  });

  it("ne soigne pas une carte en pleine santé", () => {
    const setup = setupOf([fighter({ technique: "IYASHI" })], [fighter()]);
    const { state } = createState(setup);
    state.orbs = 5;
    expect(scoreAction(setup, state, { type: "TECHNIQUE", side: 0, actor: 0, target: 0 })).toBeLessThan(0);
  });

  it("finit son tour quand plus rien n'est jouable", () => {
    const setup = setupOf([fighter()], [fighter()], FLAT_RULES);
    const { state } = createState(setup);
    state.fighters[0][0].actionsLeft = 0;
    expect(botAction(setup, state, 0, seededRng(1), 0)).toEqual({ type: "END_TURN", side: 0 });
  });

  it("a des noms affichables", () => {
    expect(BOT_NAMES.length).toBeGreaterThan(3);
  });
});
