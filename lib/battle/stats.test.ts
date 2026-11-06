import { describe, expect, it } from "vitest";
import { RARITIES } from "@/lib/catalog/rarity";
import { seededRng } from "@/lib/rng";
import { BOT_NAMES, botAction, botRarities, scoreAction } from "./bot";
import { DEFAULT_BATTLE_RULES } from "./config";
import { createState } from "./engine";
import { FLAT_RULES, fighter, RULES, setupOf } from "./fixtures";
import { buildSetup, combatStats, fighterFrom, firstSide, keywordsFor, techniqueFor, ultimateFor } from "./stats";
import { KEYWORDS, LEGACY_KEYWORDS, LEGACY_TECHNIQUES, NEW_KEYWORDS, NEW_TECHNIQUES, TECHNIQUES, ULTIMATES, type Action, type BattleSetup, type BattleState, type Keyword, type Technique } from "./types";
import { mixSeed } from "@/lib/rng";

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
    for (const t of LEGACY_TECHNIQUES) expect(tech.get(t)).toBeGreaterThan(800);
    for (const k of LEGACY_KEYWORDS) expect(kw.get(k)).toBeGreaterThan(800);
  });
});

describe("attribution des capacités", () => {
  const perRarity = rules.keywordsByRarity;
  const isNew = (k: string) => (NEW_KEYWORDS as readonly string[]).includes(k) || (NEW_TECHNIQUES as readonly string[]).includes(k);

  // Copie de l'ancien calcul, avant les nouveautés : elle ne doit plus jamais changer
  function oldKeywords(id: number, rarity: keyof typeof perRarity): string[] {
    const list = ["TAUNT", "BARRIER", "FLURRY", "POISON", "RIPOSTE", "LAST_WILL", "REVIVE"];
    const count = Math.min(perRarity[rarity] ?? 0, list.length);
    const rng = seededRng(mixSeed(id, 0x6b77));
    const pool = [...list];
    const picked: string[] = [];
    for (let i = 0; i < count; i++) picked.push(pool.splice(rng(pool.length), 1)[0]);
    return picked.sort((a, b) => list.indexOf(a) - list.indexOf(b));
  }
  const oldTechnique = (id: number) => ["ISSEN", "KANTSU", "RANBU", "IYASHI", "SHUGO", "KOBU", "FUIN"][mixSeed(id, 0x7463) % 7];

  it("garde l'ordre des capacités d'origine, les nouveautés en fin de liste", () => {
    expect(KEYWORDS.slice(0, LEGACY_KEYWORDS.length)).toEqual([...LEGACY_KEYWORDS]);
    expect(TECHNIQUES.slice(0, LEGACY_TECHNIQUES.length)).toEqual([...LEGACY_TECHNIQUES]);
  });

  it("à 0 %, le tirage reste identique à l'ancien, pour toutes les raretés", () => {
    for (let id = 1; id <= 200; id++) {
      for (const rarity of RARITIES) expect(keywordsFor(id, rarity, perRarity, 0)).toEqual(oldKeywords(id, rarity));
      expect(techniqueFor(id, 0)).toBe(oldTechnique(id));
      // Sans réglage transmis aussi
      expect(techniqueFor(id)).toBe(oldTechnique(id));
    }
  });

  it("à 30 %, chaque carte reste stable, et environ 30 % des emplacements reçoivent une nouveauté", () => {
    let techniques = 0;
    let slots = 0;
    let fresh = 0;
    const ids = 6_000;
    for (let id = 1; id <= ids; id++) {
      const k = keywordsFor(id, "LEGENDARY", perRarity, 30);
      const t = techniqueFor(id, 30);
      expect(keywordsFor(id, "LEGENDARY", perRarity, 30)).toEqual(k);
      expect(techniqueFor(id, 30)).toBe(t);
      if (isNew(t)) techniques++;
      slots += k.length;
      fresh += k.filter(isNew).length;
    }
    expect(techniques / ids).toBeGreaterThan(0.27);
    expect(techniques / ids).toBeLessThan(0.33);
    expect(fresh / slots).toBeGreaterThan(0.27);
    expect(fresh / slots).toBeLessThan(0.33);
  });

  it("une carte qui ne reçoit pas de nouveauté garde exactement sa capacité d'origine", () => {
    for (let id = 1; id <= 500; id++) {
      const t = techniqueFor(id, 30);
      if (!isNew(t)) expect(t).toBe(oldTechnique(id));
      const before = oldKeywords(id, "LEGENDARY");
      for (const k of keywordsFor(id, "LEGENDARY", perRarity, 30)) if (!isNew(k)) expect(before).toContain(k);
    }
  });

  it("monter le réglage ajoute des nouveautés sans changer celles déjà attribuées", () => {
    for (let id = 1; id <= 500; id++) {
      const low = keywordsFor(id, "LEGENDARY", perRarity, 30).filter(isNew);
      expect(keywordsFor(id, "LEGENDARY", perRarity, 70)).toEqual(expect.arrayContaining(low));
      const t = techniqueFor(id, 30);
      if (isNew(t)) expect(techniqueFor(id, 70)).toBe(t);
    }
  });

  it("à 100 %, tout est nouveau, sans doublon ni ordre aléatoire", () => {
    const fiveSlots = { ...perRarity, XR: 5 };
    for (let id = 1; id <= 300; id++) {
      const k = keywordsFor(id, "XR", fiveSlots, 100);
      expect(k).toHaveLength(5);
      expect(k.every(isNew)).toBe(true);
      expect(new Set(k).size).toBe(5);
      expect(k).toEqual([...k].sort((a, b) => KEYWORDS.indexOf(a) - KEYWORDS.indexOf(b)));
      expect(isNew(techniqueFor(id, 100))).toBe(true);
    }
  });

  it("une carte de combat suit le réglage de ses règles", () => {
    const card = { id: "c", anilistId: 42, name: "x", nameNative: null, imageUrl: "/x", rank: 1, rarity: "LEGENDARY", power: 50, ki: 50 };
    const on = fighterFrom(card, { ...rules, newAbilityPct: 100 });
    expect(on.keywords.every(isNew)).toBe(true);
    expect(isNew(on.technique)).toBe(true);
    const off = fighterFrom(card, { ...rules, newAbilityPct: 0 });
    expect(off.keywords).toEqual(oldKeywords(42, "LEGENDARY"));
    expect(off.technique).toBe(oldTechnique(42));
  });
});

describe("bot et nouvelles techniques", () => {
  const start = (mine: Parameters<typeof fighter>[0][], theirs: Parameters<typeof fighter>[0][], orbs = 5) => {
    const setup = setupOf(mine.map((o) => fighter(o)), theirs.map((o) => fighter(o)), RULES);
    const { state } = createState(setup);
    state.orbs = orbs;
    state.budget = null;
    return { setup, state };
  };
  const played = (setup: ReturnType<typeof setupOf>, state: ReturnType<typeof start>["state"]) => botAction(setup, state, 0, seededRng(1), 0);
  const techniqueOf = (setup: ReturnType<typeof setupOf>, a: Action): Technique | null => (a.type === "TECHNIQUE" ? setup.teams[0][a.actor].technique : null);
  const CASES: Record<(typeof NEW_TECHNIQUES)[number], () => ReturnType<typeof start>> = {
    KONSHIN: () => start([{ technique: "KONSHIN", power: 90 }], [{ ki: 40 }]),
    RENGEKI: () => {
      // Une Barrière arrêterait un coup simple : la double frappe passe quand même
      const ctx = start([{ technique: "RENGEKI", power: 90 }], [{ keywords: ["BARRIER"] }]);
      return ctx;
    },
    JIU: () => {
      const ctx = start([{ technique: "JIU", power: 1 }, { power: 1 }, { power: 1 }], [{ ki: 90 }]);
      ctx.state.fighters[0].forEach((f) => (f.hp = Math.floor(f.maxHp / 2)));
      return ctx;
    },
    DOKUGIRI: () => start([{ technique: "DOKUGIRI", power: 1 }], [{ ki: 90 }, { ki: 90 }, { ki: 90 }]),
    MEISO: () => start([{ technique: "MEISO", power: 1 }, { technique: "RANBU", power: 90 }], [{ ki: 40 }, { ki: 40 }, { ki: 40 }], 1),
  };

  it.each(NEW_TECHNIQUES)("joue %s dans une situation favorable", (technique) => {
    const { setup, state } = CASES[technique]();
    expect(techniqueOf(setup, played(setup, state))).toBe(technique);
  });

  it("ne médite pas sans allié capable d'en profiter, même par erreur", () => {
    const alone = start([{ technique: "MEISO" }], [{}], 1);
    expect(scoreAction(alone.setup, alone.state, { type: "TECHNIQUE", side: 0, actor: 0 })).toBeLessThanOrEqual(0);
    for (let seed = 1; seed <= 200; seed++) {
      const a = botAction(alone.setup, alone.state, 0, seededRng(seed), 100);
      expect(techniqueOf(alone.setup, a)).toBeNull();
    }
    // Les orbes suffisent déjà à l'allié : méditer ne sert à rien
    const rich = start([{ technique: "MEISO", power: 1 }, { technique: "RANBU", power: 90 }], [{ ki: 40 }, { ki: 40 }], 5);
    expect(scoreAction(rich.setup, rich.state, { type: "TECHNIQUE", side: 0, actor: 0 })).toBeLessThanOrEqual(0);
  });

  it("ne soigne pas une équipe en pleine santé", () => {
    const { setup, state } = start([{ technique: "JIU" }, {}], [{}]);
    expect(scoreAction(setup, state, { type: "TECHNIQUE", side: 0, actor: 0 })).toBeLessThan(0);
  });

  it("réussit une double frappe plutôt qu'un coup absolu inutile sur une Barrière", () => {
    const { setup, state } = start([{ technique: "KONSHIN", power: 90 }], [{ keywords: ["BARRIER"] }]);
    expect(scoreAction(setup, state, { type: "TECHNIQUE", side: 0, actor: 0, target: 0 })).toBeLessThan(0);
  });

  it("compte la Cuirasse et l'Exécution dans ses estimations", () => {
    const armored = start([{ power: 100 }], [{ keywords: ["ARMOR"], ki: 50 }, { ki: 50 }]);
    const a = scoreAction(armored.setup, armored.state, { type: "ATTACK", side: 0, actor: 0, target: 0 });
    const b = scoreAction(armored.setup, armored.state, { type: "ATTACK", side: 0, actor: 0, target: 1 });
    expect(a).toBeLessThan(b);
    const low = start([{ keywords: ["EXECUTE"] as Keyword[], power: 50 }], [{ ki: 50 }, { ki: 50 }]);
    low.state.fighters[1][0].hp = Math.floor(low.state.fighters[1][0].maxHp / 2);
    const weak = scoreAction(low.setup, low.state, { type: "ATTACK", side: 0, actor: 0, target: 0 });
    const healthy = scoreAction(low.setup, low.state, { type: "ATTACK", side: 0, actor: 0, target: 1 });
    expect(weak).toBeGreaterThan(healthy);
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

describe("ultis", () => {
  const card = (anilistId: number, rarity: string) => ({ id: `c${anilistId}`, anilistId, name: "x", nameNative: null, imageUrl: "/x", rank: 1, rarity, power: 60, ki: 60 });

  it("Gold, MR et XR par défaut, et seulement les raretés cochées", () => {
    expect(rules.ultimateRarities).toEqual(["GOLD", "MR", "XR"]);
    for (const rarity of [...RARITIES, "BR", "AR", "VR"]) expect(ultimateFor(7, rarity, rules)).toBeNull();
    for (const rarity of ["GOLD", "MR", "XR"]) expect(ultimateFor(7, rarity, rules)).not.toBeNull();
    expect(ultimateFor(7, "XR", { ultimateRarities: [] })).toBeNull();
    expect(ultimateFor(7, "EPIC", { ultimateRarities: ["EPIC"] })).not.toBeNull();
  });

  it("toujours le même pour un personnage, quelle que soit sa rareté cochée, et les 5 sortent", () => {
    const seen = new Set<string>();
    for (let id = 1; id <= 300; id++) {
      const u = ultimateFor(id, "GOLD", rules);
      expect(ultimateFor(id, "XR", rules)).toBe(u);
      expect(ultimateFor(id, "GOLD", rules)).toBe(u);
      seen.add(u!);
    }
    expect([...seen].sort()).toEqual([...ULTIMATES].sort());
  });

  it("identique avec ou sans kit d'atelier, absent hors des raretés cochées", () => {
    const gold = card(42, "GOLD");
    const kit = { keywords: ["FLURRY", "REVIVE", "LIFESTEAL"] as Keyword[], technique: "MEISO" as Technique };
    expect(fighterFrom(gold, rules, kit).ultimate).toBe(fighterFrom(gold, rules).ultimate);
    expect(fighterFrom(gold, rules).ultimate).toBe(ultimateFor(42, "GOLD", rules));
    const plain = fighterFrom(card(42, "MYTHIC"), rules, kit);
    expect(plain).not.toHaveProperty("ultimate");
  });
});

describe("bot et ultis", () => {
  /** Jauge pleine sur la carte 0, aucune orbe : seules l'attaque et l'ulti sont jouables. */
  const ready = (mine: Parameters<typeof fighter>[0][], theirs: Parameters<typeof fighter>[0][]) => {
    const setup = setupOf(mine.map((o) => fighter(o)), theirs.map((o) => fighter(o)), RULES);
    const { state } = createState(setup);
    state.orbs = 0;
    state.budget = null;
    state.fighters[0][0].charge = 100;
    return { setup, state };
  };
  const pick = (setup: BattleSetup, state: BattleState) => botAction(setup, state, 0, seededRng(1), 0);

  it.each(ULTIMATES)("lance %s quand il vaut nettement mieux qu'un coup", (ultimate) => {
    const { setup, state } = ready([{ ultimate }, {}, {}], [{}, {}, {}]);
    // Résurrection : il lui faut un allié à terre
    if (ultimate === "KISHI") state.fighters[0][2].hp = 0;
    expect(pick(setup, state)).toMatchObject({ type: "ULTIMATE", actor: 0 });
  });

  it("garde Rempart absolu quand chaque allié a déjà sa Barrière", () => {
    const { setup, state } = ready([{ ultimate: "FUDO" }, {}, {}], [{}, {}, {}]);
    for (const f of state.fighters[0]) f.barrier = true;
    expect(pick(setup, state).type).toBe("ATTACK");
  });

  it("garde Arrêt du temps face à un dernier ennemi qu'un coup achève", () => {
    const { setup, state } = ready([{ ultimate: "TOKIDOME" }], [{}, {}, {}]);
    state.fighters[1][0].hp = 0;
    state.fighters[1][1].hp = 0;
    state.fighters[1][2].hp = 10;
    expect(pick(setup, state)).toEqual({ type: "ATTACK", side: 0, actor: 0, target: 2 });
  });

  it("ne gâche jamais son ulti sur un coup au hasard", () => {
    const { setup, state } = ready([{ ultimate: "HYAKKA" }], [{}, {}, {}]);
    for (let seed = 0; seed < 200; seed++) expect(botAction(setup, state, 0, seededRng(seed), 100).type).not.toBe("ULTIMATE");
  });
});
