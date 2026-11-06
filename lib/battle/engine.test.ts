import { describe, expect, it } from "vitest";
import { seededRng } from "@/lib/rng";
import { botGame, randomTeam } from "./bot-games";
import { applyAction, createState, legalActions, orbsFor, replay } from "./engine";
import { atkBonusPct, rageBonusPct } from "./modifiers";
import { FLAT_RULES, RULES, fighter, setupOf } from "./fixtures";
import { LEGACY_KEYWORDS, LEGACY_TECHNIQUES, NEW_TECHNIQUES, type Action, type BattleEvent, type BattleSetup, type BattleState, type EngineRules, type Side } from "./types";

const play = (setup: BattleSetup, state: BattleState, action: Action, seed = 1) => applyAction(setup, seed, state, action);

function team3(over: Parameters<typeof fighter>[0] = {}) {
  return [fighter(over), fighter(over), fighter(over)];
}

describe("nouveaux passifs", () => {
  const k = FLAT_RULES.keywords;
  const hitOn = (events: readonly BattleEvent[]) => events.flatMap((e) => (e.t === "damage" ? [e] : []));
  const attack = (setup: BattleSetup, state: BattleState, target = 0) => play(setup, state, { type: "ATTACK", side: 0, actor: 0, target });

  it("Vampirisme : soigne d'une part des dégâts réellement infligés", () => {
    const setup = setupOf([fighter({ power: 100, keywords: ["LIFESTEAL"] })], [fighter({ ki: 100, hp: 500 })]);
    const { state } = createState(setup);
    state.fighters[0][0].hp = 50;
    const { events, state: after } = attack(setup, state);
    const dealt = hitOn(events)[0].amount;
    expect(events.map((e) => e.t)).toEqual(["attack", "damage", "lifesteal", "heal"]);
    expect(after.fighters[0][0].hp).toBe(50 + Math.floor((dealt * k.lifestealPct) / 100));
  });

  it("Vampirisme : rien à pleine santé ni contre une Barrière", () => {
    const setup = setupOf([fighter({ keywords: ["LIFESTEAL"] })], [fighter({ hp: 500 })]);
    expect(attack(setup, createState(setup).state).events.map((e) => e.t)).toEqual(["attack", "damage"]);
    const blocked = setupOf([fighter({ keywords: ["LIFESTEAL"] })], [fighter({ keywords: ["BARRIER"] })]);
    const { state } = createState(blocked);
    state.fighters[0][0].hp = 10;
    expect(attack(blocked, state).events.map((e) => e.t)).toEqual(["attack", "block"]);
  });

  it("Vampirisme sur un coup fatal : le soin vient après le K.-O., sur les seuls PV retirés", () => {
    const setup = setupOf([fighter({ power: 200, keywords: ["LIFESTEAL"] })], [fighter({ ki: 1, hp: 10 }), fighter()]);
    const { state } = createState(setup);
    state.fighters[0][0].hp = 20;
    const { events, state: after } = attack(setup, state);
    expect(events.map((e) => e.t)).toEqual(["attack", "damage", "ko", "lifesteal", "heal"]);
    expect(after.fighters[0][0].hp).toBe(20 + Math.max(1, Math.floor((10 * k.lifestealPct) / 100)));
  });

  it("Vampirisme puis riposte mortelle : le soin passe d'abord, la carte peut quand même tomber", () => {
    const setup = setupOf([fighter({ power: 100, keywords: ["LIFESTEAL"], hp: 300 })], [fighter({ ki: 0, hp: 500, keywords: ["RIPOSTE"] })]);
    const { state } = createState(setup);
    state.fighters[0][0].hp = 1;
    const { events } = attack(setup, state);
    expect(events.map((e) => e.t)).toEqual(["attack", "damage", "lifesteal", "heal", "riposte", "damage", "ko", "end"]);
  });

  it("Rage : se déclenche au seuil exact, pas au-dessus, et s'additionne aux autres bonus", () => {
    const setup = setupOf([fighter({ power: 100, keywords: ["RAGE"], hp: 200 })], [fighter({ ki: 100, hp: 900 })]);
    const { state } = createState(setup);
    const at = (hp: number) => {
      state.fighters[0][0].hp = hp;
      return attack(setup, state);
    };
    const threshold = Math.floor((200 * k.rageThresholdPct) / 100);
    expect(hitOn(at(threshold + 1).events)[0].amount).toBe(50);
    expect(hitOn(at(threshold).events)[0].amount).toBe(Math.floor((100 * (100 + k.ragePct)) / 200));
    expect(rageBonusPct(setup, state, 0, 0)).toBe(k.ragePct);
    state.fighters[0][0].buffPct = 20;
    state.fighters[0][0].buffTurns = 1;
    expect(atkBonusPct(setup, state, 0, 0)).toBe(k.ragePct + 20);
  });

  it("Rage : aucune trace sur une carte qui n'a pas le passif", () => {
    const setup = setupOf([fighter({ power: 100, hp: 200 })], [fighter({ ki: 100 })]);
    const { state } = createState(setup);
    state.fighters[0][0].hp = 1;
    expect(rageBonusPct(setup, state, 0, 0)).toBe(0);
  });

  it("Cuirasse : retire sa part des dégâts, sauf contre une Percée", () => {
    const setup = setupOf([fighter({ power: 100, technique: "KANTSU" })], [fighter({ ki: 0, hp: 900, keywords: ["ARMOR"] })]);
    const { state } = createState(setup);
    state.orbs = 5;
    expect(hitOn(attack(setup, state).events)[0].amount).toBe(Math.floor((100 * (100 - k.armorPct)) / 100));
    const pierced = play(setup, state, { type: "TECHNIQUE", side: 0, actor: 0, target: 0 });
    expect(hitOn(pierced.events)[0].amount).toBe(100);
  });

  it("Exécution : se déclenche au seuil de la cible, pas au-dessus", () => {
    const setup = setupOf([fighter({ power: 100, keywords: ["EXECUTE"] })], [fighter({ ki: 100, hp: 1_000 })]);
    const { state } = createState(setup);
    const at = (hp: number) => {
      state.fighters[1][0].hp = hp;
      return hitOn(attack(setup, state).events)[0].amount;
    };
    const threshold = Math.floor((1_000 * k.executeThresholdPct) / 100);
    expect(at(threshold + 1)).toBe(50);
    expect(at(threshold)).toBe(Math.floor((50 * (100 + k.executePct)) / 100));
  });

  it("Exécution et Cuirasse se cumulent sans perdre de précision, jamais sous 1 dégât", () => {
    const setup = setupOf([fighter({ power: 100, keywords: ["EXECUTE"] })], [fighter({ ki: 100, hp: 1_000, keywords: ["ARMOR"] })]);
    const { state } = createState(setup);
    state.fighters[1][0].hp = 10;
    expect(hitOn(attack(setup, state).events)[0].amount).toBe(Math.floor((50 * (100 + k.executePct) * (100 - k.armorPct)) / 10_000));
    const tiny = setupOf([fighter({ power: 1 })], [fighter({ ki: 999, keywords: ["ARMOR"] })]);
    expect(hitOn(attack(tiny, createState(tiny).state).events)[0].amount).toBe(1);
  });

  it("Concentration : orbes en plus au début du tour, cumulables, après le tour annoncé", () => {
    const setup = setupOf([fighter(), fighter()], [fighter({ keywords: ["CHANNEL"] }), fighter({ keywords: ["CHANNEL"] })], RULES, 0);
    const { state: first } = createState(setup);
    const res = play(setup, first, { type: "END_TURN", side: 0 });
    const turn = res.events.find((e) => e.t === "turn");
    expect(turn).toMatchObject({ orbs: orbsFor(2, 1, setup) });
    expect(res.events.at(-1)).toEqual({ t: "orbs", side: 1, orbs: orbsFor(2, 1, setup) + 2 * RULES.keywords.channelOrbs });
    expect(res.state.orbs).toBe(orbsFor(2, 1, setup) + 2 * RULES.keywords.channelOrbs);
  });

  it("Concentration : dès le premier tour de la partie", () => {
    const setup = setupOf([fighter({ keywords: ["CHANNEL"] })], [fighter()], RULES, 0);
    const { state, events } = createState(setup);
    expect(state.orbs).toBe(orbsFor(1, 0, setup) + RULES.keywords.channelOrbs);
    expect(events.map((e) => e.t)).toEqual(["turn", "orbs"]);
  });

  it("Concentration : une carte morte au poison en début de tour ne rapporte rien", () => {
    const setup = setupOf([fighter(), fighter()], [fighter({ keywords: ["CHANNEL"] }), fighter()], RULES, 0);
    const { state } = createState(setup);
    Object.assign(state.fighters[1][0], { hp: 1, poisonTurns: 1, poisonDmg: 50 });
    const res = play(setup, state, { type: "END_TURN", side: 0 });
    expect(res.events.map((e) => e.t)).toEqual(["turn", "poison", "ko"]);
    expect(res.state.orbs).toBe(orbsFor(2, 1, setup));
  });
});

describe("nouvelles techniques", () => {
  const cast = (setup: BattleSetup, state: BattleState, actor = 0, target?: number) =>
    play(setup, { ...state, orbs: 5 }, { type: "TECHNIQUE", side: 0, actor, ...(target === undefined ? {} : { target }) });
  const value = (t: keyof typeof FLAT_RULES.techniques) => FLAT_RULES.techniques[t].value;

  it("Coup absolu : frappe fort, puis la carte passe son prochain tour et un seul", () => {
    const setup = setupOf([fighter({ power: 100, technique: "KONSHIN" }), fighter()], [fighter({ ki: 100, hp: 900 })]);
    const { state, events } = cast(setup, createState(setup).state, 0, 0);
    expect(events.find((e) => e.t === "damage")).toMatchObject({ amount: Math.floor((50 * value("KONSHIN")) / 100) });
    expect(events.at(-1)).toEqual({ t: "seal", side: 0, index: 0 });
    let s = play(setup, state, { type: "END_TURN", side: 0 }).state;
    s = play(setup, s, { type: "END_TURN", side: 1 }).state;
    expect(s.fighters[0][0].actionsLeft).toBe(0);
    expect(s.fighters[0][1].actionsLeft).toBe(1);
    s = play(setup, s, { type: "END_TURN", side: 0 }).state;
    s = play(setup, s, { type: "END_TURN", side: 1 }).state;
    expect(s.fighters[0][0].actionsLeft).toBe(1);
  });

  it("Coup absolu avec Rafale : la seconde action du tour reste, le tour suivant est perdu", () => {
    const setup = setupOf([fighter({ technique: "KONSHIN", keywords: ["FLURRY"] })], [fighter({ ki: 999, hp: 900 })]);
    const { state } = cast(setup, createState(setup).state, 0, 0);
    expect(state.fighters[0][0].actionsLeft).toBe(1);
    const again = play(setup, state, { type: "ATTACK", side: 0, actor: 0, target: 0 }).state;
    let s = play(setup, again, { type: "END_TURN", side: 0 }).state;
    s = play(setup, s, { type: "END_TURN", side: 1 }).state;
    expect(s.fighters[0][0].actionsLeft).toBe(0);
    s = play(setup, s, { type: "END_TURN", side: 0 }).state;
    s = play(setup, s, { type: "END_TURN", side: 1 }).state;
    expect(s.fighters[0][0].actionsLeft).toBe(2);
  });

  it("Coup absolu qui finit la partie : pas de contrecoup à afficher sur le gagnant", () => {
    const setup = setupOf([fighter({ power: 300, technique: "KONSHIN" })], [fighter({ ki: 1, hp: 5 })]);
    const { events, state } = cast(setup, createState(setup).state, 0, 0);
    expect(events.map((e) => e.t)).toEqual(["attack", "damage", "ko", "end"]);
    expect(state.fighters[0][0].sealed).toBe(false);
  });

  it("Coup absolu sur une Barrière : le coup est perdu, le contrecoup reste", () => {
    const setup = setupOf([fighter({ technique: "KONSHIN" })], [fighter({ keywords: ["BARRIER"] })]);
    expect(cast(setup, createState(setup).state, 0, 0).events.map((e) => e.t)).toEqual(["attack", "block", "seal"]);
  });

  it("Double frappe : deux coups, à chaque fois un tirage de hasard", () => {
    const setup = setupOf([fighter({ power: 100, technique: "RENGEKI" })], [fighter({ ki: 100, hp: 900 })]);
    const { events } = cast(setup, createState(setup).state, 0, 0);
    const hits = events.filter((e) => e.t === "damage");
    expect(hits).toHaveLength(2);
    expect(hits[0]).toMatchObject({ amount: Math.floor((50 * value("RENGEKI")) / 100) });
  });

  it("Double frappe sur une Barrière : le premier coup la brise, le second passe", () => {
    const setup = setupOf([fighter({ power: 100, technique: "RENGEKI" })], [fighter({ ki: 100, hp: 900, keywords: ["BARRIER"] })]);
    const { events, state } = cast(setup, createState(setup).state, 0, 0);
    expect(events.map((e) => e.t)).toEqual(["attack", "block", "damage"]);
    expect(state.fighters[1][0].barrier).toBe(false);
  });

  it("Double frappe sur une Barrière puis Renaissance : le second coup déclenche la renaissance", () => {
    const setup = setupOf([fighter({ power: 300, technique: "RENGEKI" })], [fighter({ ki: 1, hp: 5, keywords: ["BARRIER", "REVIVE"] })]);
    const { events, state } = cast(setup, createState(setup).state, 0, 0);
    expect(events.map((e) => e.t)).toEqual(["attack", "block", "damage", "revive"]);
    expect(state.fighters[1][0].hp).toBeGreaterThan(0);
  });

  it("Double frappe : la Renaissance subit le second coup, une cible morte n'en subit pas", () => {
    const reborn = setupOf([fighter({ power: 300, technique: "RENGEKI" })], [fighter({ ki: 1, hp: 5, keywords: ["REVIVE"] }), fighter()]);
    expect(cast(reborn, createState(reborn).state, 0, 0).events.map((e) => e.t)).toEqual(["attack", "damage", "revive", "damage", "ko"]);
    const dead = setupOf([fighter({ power: 300, technique: "RENGEKI" })], [fighter({ ki: 1, hp: 5 }), fighter()]);
    expect(cast(dead, createState(dead).state, 0, 0).events.map((e) => e.t)).toEqual(["attack", "damage", "ko"]);
  });

  it("Pluie de soin : soigne tous les alliés debout, plafonné aux PV max", () => {
    const setup = setupOf([fighter({ technique: "JIU", hp: 200 }), fighter({ hp: 200 }), fighter({ hp: 200 })], [fighter()]);
    const { state } = createState(setup);
    state.fighters[0][0].hp = 100;
    state.fighters[0][1].hp = 199;
    state.fighters[0][2].hp = 0;
    const res = cast(setup, state);
    expect(res.state.fighters[0].map((f) => f.hp)).toEqual([100 + Math.ceil((200 * value("JIU")) / 100), 200, 0]);
    expect(res.events.filter((e) => e.t === "heal")).toHaveLength(2);
  });

  it("Brume toxique : empoisonne tous les ennemis, une Barrière l'arrête, puis le poison agit", () => {
    const setup = setupOf([fighter({ technique: "DOKUGIRI" })], [fighter({ hp: 200 }), fighter({ hp: 200, keywords: ["BARRIER"] }), fighter({ hp: 200 })]);
    const { state } = createState(setup);
    state.fighters[1][2].hp = 0;
    const res = cast(setup, state);
    expect(res.events.map((e) => e.t)).toEqual(["attack", "poisoned", "block"]);
    expect(res.state.fighters[1][0]).toMatchObject({ poisonTurns: FLAT_RULES.keywords.poisonTurns, poisonDmg: Math.ceil((200 * value("DOKUGIRI")) / 100) });
    expect(res.state.fighters[1][1]).toMatchObject({ poisonTurns: 0, barrier: false });
    const tick = play(setup, res.state, { type: "END_TURN", side: 0 });
    expect(tick.events).toContainEqual(expect.objectContaining({ t: "poison", side: 1, index: 0 }));
  });

  it("Méditation : dépense l'action de la carte et donne ses orbes tout de suite, sans en coûter", () => {
    const setup = setupOf([fighter({ technique: "MEISO" }), fighter({ technique: "RANBU" })], [fighter({ ki: 999 })], FLAT_RULES);
    const { state: start } = createState(setup);
    const res = play(setup, { ...start, orbs: 0 }, { type: "TECHNIQUE", side: 0, actor: 0 });
    expect(res.events).toEqual([
      { t: "attack", side: 0, actor: 0, target: null, technique: "MEISO" },
      { t: "orbs", side: 0, orbs: value("MEISO") },
    ]);
    expect(res.state.fighters[0][0].actionsLeft).toBe(0);
    expect(() => play(setup, res.state, { type: "ATTACK", side: 0, actor: 0, target: 0 })).toThrow("ACTOR_UNAVAILABLE");
  });

  it("une technique sans cible refuse une cible, comme les anciennes", () => {
    const setup = setupOf([fighter({ technique: "JIU" })], [fighter()]);
    expect(() => play(setup, { ...createState(setup).state, orbs: 5 }, { type: "TECHNIQUE", side: 0, actor: 0, target: 0 })).toThrow("BAD_TARGET");
  });
});

describe("ultis", () => {
  // Valeurs fixées ici : les tests ne bougent pas quand l'équilibrage change les défauts
  const U: EngineRules = {
    ...FLAT_RULES,
    ultimate: { charge: { perAction: 25, damagePct: 50 }, values: { TENCHU: 300, HYAKKA: 130, KISHI: 50, FUDO: 0, TOKIDOME: 0 } },
  };
  const setupU = (a: Parameters<typeof setupOf>[0], b: Parameters<typeof setupOf>[1]) => setupOf(a, b, U);
  const ult = (setup: BattleSetup, state: BattleState, actor: number, target?: number, side: Side = 0) =>
    play(setup, state, { type: "ULTIMATE", side, actor, ...(target === undefined ? {} : { target }) });
  /** État de départ, jauges pleines sur les cartes qui ont un ulti. */
  const ready = (setup: BattleSetup) => {
    const { state } = createState(setup);
    for (const team of state.fighters) for (const f of team) if (f.charge !== undefined) f.charge = 100;
    return state;
  };

  it("une carte sans ulti n'a ni jauge ni ulti : l'état d'une partie d'avant reste identique", () => {
    const setup = setupU(team3(), team3());
    const { state } = createState(setup);
    for (const f of state.fighters.flat()) expect(Object.keys(f)).not.toContain("charge");
    const after = play(setup, state, { type: "ATTACK", side: 0, actor: 0, target: 0 }).state;
    expect(after.fighters.flat().some((f) => "charge" in f || "ultUsed" in f)).toBe(false);
  });

  it("charge : +25 par action, attaque ou technique, plafonnée à 100", () => {
    const setup = setupU([fighter({ ultimate: "TENCHU", keywords: ["FLURRY"] })], [fighter({ ki: 999, hp: 900 })]);
    let { state } = createState(setup);
    state = play(setup, state, { type: "ATTACK", side: 0, actor: 0, target: 0 }).state;
    expect(state.fighters[0][0].charge).toBe(25);
    state = play(setup, { ...state, orbs: 5 }, { type: "TECHNIQUE", side: 0, actor: 0, target: 0 }).state;
    expect(state.fighters[0][0].charge).toBe(50);
    state.fighters[0][0].charge = 90;
    state = play(setup, state, { type: "END_TURN", side: 0 }).state;
    state = play(setup, state, { type: "END_TURN", side: 1 }).state;
    state = play(setup, state, { type: "ATTACK", side: 0, actor: 0, target: 0 }).state;
    expect(state.fighters[0][0].charge).toBe(100);
  });

  it("charge : une part des PV perdus sous les coups, la riposte et le poison", () => {
    const hp = 200;
    // Coup reçu : 50 points pour 100 % des PV, au prorata, arrondi en dessous
    const hitSetup = setupU([fighter({ power: 100 })], [fighter({ ki: 0, hp, ultimate: "FUDO" })]);
    const hitState = play(hitSetup, createState(hitSetup).state, { type: "ATTACK", side: 0, actor: 0, target: 0 }).state;
    expect(hitState.fighters[1][0].charge).toBe(Math.floor((100 * 50) / hp));
    // Riposte encaissée par l'attaquant : son action, plus les PV que la riposte lui retire
    const back = setupU([fighter({ power: 100, ki: 0, hp, ultimate: "TENCHU" })], [fighter({ ki: 0, hp: 900, keywords: ["RIPOSTE"] })]);
    const { state: riposted, events } = play(back, createState(back).state, { type: "ATTACK", side: 0, actor: 0, target: 0 });
    const returned = events.filter((e) => e.t === "damage" && e.side === 0).map((e) => (e.t === "damage" ? e.amount : 0))[0];
    expect(riposted.fighters[0][0].charge).toBe(25 + Math.floor((returned * 50) / hp));
    // Tic de poison au début du tour de la carte
    const poison = setupU(team3(), [fighter({ hp, ultimate: "KISHI" }), fighter(), fighter()]);
    const { state: s0 } = createState(poison);
    Object.assign(s0.fighters[1][0], { poisonTurns: 2, poisonDmg: 40 });
    const ticked = play(poison, s0, { type: "END_TURN", side: 0 }).state;
    expect(ticked.fighters[1][0].charge).toBe(Math.floor((40 * 50) / hp));
  });

  it("refusé tant que la jauge n'est pas pleine, sans ulti, ou une seconde fois", () => {
    const setup = setupU([fighter({ ultimate: "HYAKKA" }), fighter()], team3());
    const { state } = createState(setup);
    state.fighters[0][0].charge = 99;
    expect(() => ult(setup, state, 0)).toThrow("ULTIMATE_NOT_READY");
    expect(() => ult(setup, ready(setup), 1)).toThrow("ULTIMATE_NOT_READY");
    const once = ult(setup, ready(setup), 0).state;
    expect(once.fighters[0][0]).toMatchObject({ charge: 0, ultUsed: true });
    // Même rechargée à la main, la jauge ne rouvre pas l'ulti
    once.fighters[0][0].charge = 100;
    once.fighters[0][0].actionsLeft = 1;
    expect(() => ult(setup, once, 0)).toThrow("ULTIMATE_NOT_READY");
  });

  it("l'ulti prend l'action de la carte et une du budget du tour, sans rien recharger", () => {
    const setup = { ...setupU([fighter({ ultimate: "FUDO" }), fighter()], team3()), rules: { ...U, firstTurnActions: 2 } };
    const { state } = ult(setup, ready(setup), 0);
    expect(state.fighters[0][0]).toMatchObject({ actionsLeft: 0, charge: 0 });
    expect(state.budget).toBe(1);
    expect(state.orbs).toBe(createState(setup).state.orbs);
  });

  it("legalActions propose l'ulti avec ses seules cibles permises", () => {
    const setup = setupU([fighter({ ultimate: "TENCHU" }), fighter({ ultimate: "KISHI" }), fighter({ ultimate: "FUDO" })], [fighter(), fighter({ keywords: ["TAUNT"] }), fighter()]);
    const state = ready(setup);
    state.fighters[0][2].hp = 0;
    const ults = legalActions(setup, state, 0).filter((a) => a.type === "ULTIMATE");
    expect(ults).toEqual([
      { type: "ULTIMATE", side: 0, actor: 0, target: 1 },
      { type: "ULTIMATE", side: 0, actor: 1, target: 2 },
    ]);
  });

  it("Châtiment céleste : respecte la Provocation", () => {
    const setup = setupU([fighter({ ultimate: "TENCHU" })], [fighter(), fighter({ keywords: ["TAUNT"] })]);
    expect(() => ult(setup, ready(setup), 0, 0)).toThrow("TAUNT");
    expect(() => ult(setup, ready(setup), 0)).toThrow("BAD_TARGET");
    expect(() => ult(setup, ready(setup), 0, 1)).not.toThrow();
  });

  it("Châtiment céleste : ×3 sans DEF ni Cuirasse, et la Barrière vole en éclats sans arrêter le coup", () => {
    const setup = setupU([fighter({ power: 100, ultimate: "TENCHU" })], [fighter({ ki: 80, hp: 900, keywords: ["ARMOR", "BARRIER"] })]);
    const { state, events } = ult(setup, ready(setup), 0, 0);
    expect(events.map((e) => e.t)).toEqual(["ultimate", "block", "damage"]);
    expect(events[0]).toEqual({ t: "ultimate", side: 0, actor: 0, target: 0, ultimate: "TENCHU" });
    expect(events[1]).toEqual({ t: "block", side: 1, index: 0, pierced: true });
    expect(events[2]).toMatchObject({ amount: 300 });
    expect(state.fighters[1][0].barrier).toBe(false);
  });

  it("Tempête de pétales : frappe tous les ennemis debout à ×1,3, une Barrière l'arrête", () => {
    const setup = setupU([fighter({ power: 100, ultimate: "HYAKKA" })], [fighter({ ki: 0, hp: 900 }), fighter({ ki: 0, hp: 900, keywords: ["BARRIER"] }), fighter({ ki: 0 })]);
    const state = ready(setup);
    state.fighters[1][2].hp = 0;
    const { events } = ult(setup, state, 0);
    expect(events.filter((e) => e.t === "damage")).toEqual([{ t: "damage", side: 1, index: 0, amount: 130, crit: false, hp: 770 }]);
    expect(events).toContainEqual({ t: "block", side: 1, index: 1 });
  });

  it("Résurrection : refusée sans allié à terre, ni sur elle-même", () => {
    const setup = setupU([fighter({ ultimate: "KISHI" }), fighter()], team3());
    const state = ready(setup);
    expect(() => ult(setup, state, 0, 1)).toThrow("BAD_TARGET");
    expect(() => ult(setup, state, 0, 0)).toThrow("BAD_TARGET");
    expect(() => ult(setup, state, 0)).toThrow("BAD_TARGET");
    expect(() => ult(setup, state, 0, 5)).toThrow("BAD_TARGET");
  });

  it("Résurrection : relève à 50 % sans agir ce tour-ci, Renaissance intacte, synergie toujours rompue", () => {
    const universe = { key: "u", name: "Univers" };
    const mine = [fighter({ ultimate: "KISHI", universe }), fighter({ keywords: ["REVIVE"], universe }), fighter({ universe })];
    const setup: BattleSetup = { ...setupU(mine, [fighter({ power: 300 }), fighter(), fighter()]), synergy: [{ key: "u", name: "Univers", atkPct: 10 }, null] };
    const state = ready(setup);
    // Tombée sans que sa Renaissance ait servi (cas forcé) : la rupture de synergie a eu lieu
    Object.assign(state.fighters[0][1], { hp: 0, actionsLeft: 0 });
    state.synergy = [false, false];
    const { state: after, events } = ult(setup, state, 0, 1);
    const hp = Math.ceil((after.fighters[0][1].maxHp * 50) / 100);
    expect(events).toEqual([
      { t: "ultimate", side: 0, actor: 0, target: 1, ultimate: "KISHI" },
      { t: "raise", side: 0, index: 1, hp },
    ]);
    expect(after.fighters[0][1]).toMatchObject({ hp, revived: false, actionsLeft: 0 });
    expect(after.synergy).toEqual([false, false]);
    expect(() => play(setup, after, { type: "ATTACK", side: 0, actor: 1, target: 0 })).toThrow("ACTOR_UNAVAILABLE");
    // Au prochain coup fatal, la Renaissance joue encore
    let s = play(setup, after, { type: "END_TURN", side: 0 }).state;
    s.fighters[0][1].hp = 1;
    s = play(setup, s, { type: "ATTACK", side: 1, actor: 0, target: 1 }).state;
    expect(s.fighters[0][1]).toMatchObject({ revived: true });
    expect(s.fighters[0][1].hp).toBeGreaterThan(0);
  });

  it("Rempart absolu : Barrière sur chaque allié debout et poison retiré", () => {
    const setup = setupU([fighter({ ultimate: "FUDO" }), fighter(), fighter()], team3());
    const state = ready(setup);
    Object.assign(state.fighters[0][1], { poisonTurns: 2, poisonDmg: 10 });
    state.fighters[0][2].hp = 0;
    const { state: after, events } = ult(setup, state, 0);
    expect(events.slice(1)).toEqual([
      { t: "barrier", side: 0, index: 0 },
      { t: "barrier", side: 0, index: 1 },
    ]);
    expect(after.fighters[0].map((f) => [f.barrier, f.poisonTurns])).toEqual([
      [true, 0],
      [true, 0],
      [false, 0],
    ]);
  });

  it("Arrêt du temps : chaque ennemi debout passe son prochain tour, Rafale comprise, puis rejoue", () => {
    const setup = setupU([fighter({ ultimate: "TOKIDOME" })], [fighter({ keywords: ["FLURRY"] }), fighter(), fighter()]);
    const state = ready(setup);
    state.fighters[1][2].hp = 0;
    const { state: after, events } = ult(setup, state, 0);
    expect(events.slice(1)).toEqual([
      { t: "seal", side: 1, index: 0 },
      { t: "seal", side: 1, index: 1 },
    ]);
    let s = play(setup, after, { type: "END_TURN", side: 0 }).state;
    expect(s.fighters[1].map((f) => f.actionsLeft)).toEqual([0, 0, 0]);
    s = play(setup, s, { type: "END_TURN", side: 1 }).state;
    s = play(setup, s, { type: "END_TURN", side: 0 }).state;
    expect(s.fighters[1].map((f) => f.actionsLeft)).toEqual([2, 1, 0]);
  });

  it("une partie avec des ultis se rejoue à l'identique depuis son journal", () => {
    const rng = seededRng(99);
    const ults = ["TENCHU", "HYAKKA", "KISHI", "FUDO", "TOKIDOME"] as const;
    const team = () => randomTeam(rng, LEGACY_KEYWORDS, LEGACY_TECHNIQUES, ults);
    for (let i = 0; i < 20; i++) {
      const setup = setupOf(team(), team(), RULES, (i % 2) as Side);
      const { state, actions } = botGame(i, setup);
      expect(replay(setup, i, actions).state).toEqual(state);
    }
  });
});

describe("cumul des bonus", () => {
  it("reste exact et loin de 2^53, tous bonus au maximum", () => {
    const rules: EngineRules = {
      ...RULES,
      damage: { critPermille: 1_000, critPct: 150, varianceMinPct: 110, varianceMaxPct: 110 },
      keywords: { ...RULES.keywords, ragePct: 200, rageThresholdPct: 100, executePct: 200, executeThresholdPct: 100, armorPct: 90 },
      techniques: { ...RULES.techniques, KONSHIN: { cost: 0, value: 1_000 } },
    };
    const attacker = fighter({ power: 100, technique: "KONSHIN", keywords: ["RAGE", "EXECUTE"], universe: { key: "u", name: "U" } });
    const setup: BattleSetup = {
      ...setupOf([attacker, fighter(), fighter()], [fighter({ ki: 0, hp: 1_000_000, keywords: ["ARMOR"] })], rules),
      synergy: [{ key: "u", name: "U", atkPct: 100 }, null],
    };
    const { state } = createState(setup);
    Object.assign(state.fighters[0][0], { buffPct: 1_000, buffTurns: 1 });
    state.fighters[0][0].hp = 1;
    const { events } = play(setup, { ...state, budget: null }, { type: "TECHNIQUE", side: 0, actor: 0, target: 0 });
    // Le même calcul en entiers exacts : aucun arrondi flottant ne doit s'y glisser
    const bonus = 1_000n + 100n + 200n;
    const num = 100n * (100n + bonus) * 100n * 150n * 110n * 1_000n;
    expect(num).toBeLessThan(2n ** 53n);
    const base = num / (100n * 100_000_000n);
    const exact = (base * 300n * 10n) / 10_000n;
    expect(events.find((e) => e.t === "damage")).toMatchObject({ amount: Number(exact) });
  });
});

describe("parties sans synergie", () => {
  function fnv(s: string) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  it("mêmes chiffres qu'avant : 200 parties bot contre bot, au caractère près", { timeout: 60_000 }, () => {
    // Empreinte calculée avec le moteur d'avant la synergie (commit 5fc2726). Si elle change, les anciennes
    // parties et leurs replays changent aussi : ne la mets pas à jour sans comprendre pourquoi.
    // Une vraie partie ancienne : capacités d'origine, et un setup qui ignore tout des nouvelles valeurs
    const { lifestealPct, ragePct, rageThresholdPct, armorPct, executePct, executeThresholdPct, channelOrbs, ...oldKeywords } = RULES.keywords;
    void [lifestealPct, ragePct, rageThresholdPct, armorPct, executePct, executeThresholdPct, channelOrbs];
    const oldTechniques = Object.fromEntries(Object.entries(RULES.techniques).filter(([t]) => !(NEW_TECHNIQUES as readonly string[]).includes(t)));
    const oldRules = { ...RULES, keywords: oldKeywords, techniques: oldTechniques } as unknown as EngineRules;
    const team = (rng: (n: number) => number) => randomTeam(rng, LEGACY_KEYWORDS, LEGACY_TECHNIQUES);
    const rng = seededRng(777);
    let digest = 0;
    for (let i = 0; i < 200; i++) {
      const setup = setupOf(team(rng), team(rng), oldRules, rng(2) as Side);
      const { state, steps } = replay(setup, i, botGame(i, setup).actions);
      digest = fnv(`${digest}:${JSON.stringify(steps.map((s) => s.events))}:${JSON.stringify(state)}`);
    }
    expect(digest).toBe(2642083999);
  });
});

describe("dégâts (formule du plan)", () => {
  it("ATK × 100 / (100 + DEF), sans hasard", () => {
    const setup = setupOf([fighter({ power: 80 })], [fighter({ ki: 60 })]);
    const { state } = createState(setup);
    const { events } = play(setup, state, { type: "ATTACK", side: 0, actor: 0, target: 0 });
    expect(events).toContainEqual(expect.objectContaining({ t: "damage", amount: 50, crit: false })); // 80 × 100 / 160
  });

  it("au moins 1 dégât, même contre une énorme défense", () => {
    const setup = setupOf([fighter({ power: 1 })], [fighter({ ki: 999 })]);
    const { events } = play(setup, createState(setup).state, { type: "ATTACK", side: 0, actor: 0, target: 0 });
    expect(events.find((e) => e.t === "damage")).toMatchObject({ amount: 1 });
  });

  it("reste dans les bornes de l'aléa et du critique", () => {
    const setup = setupOf([fighter({ power: 100 })], [fighter({ ki: 100 })], RULES);
    const base = 50; // 100 × 100 / 200
    for (let seed = 0; seed < 2_000; seed++) {
      const { events } = play(setup, createState(setup).state, { type: "ATTACK", side: 0, actor: 0, target: 0 }, seed);
      const d = events.find((e) => e.t === "damage")!;
      if (d.t !== "damage") throw new Error();
      const lo = Math.floor(base * 0.9 * (d.crit ? 1.5 : 1));
      const hi = Math.floor(base * 1.1 * (d.crit ? 1.5 : 1));
      expect(d.amount).toBeGreaterThanOrEqual(lo);
      expect(d.amount).toBeLessThanOrEqual(hi);
    }
  });

  it("environ 10 % de critiques sur 10 000 graines", () => {
    const setup = setupOf([fighter()], [fighter()], RULES);
    const start = createState(setup).state;
    let crits = 0;
    for (let seed = 0; seed < 10_000; seed++) {
      const { events } = play(setup, start, { type: "ATTACK", side: 0, actor: 0, target: 0 }, seed);
      if (events.some((e) => e.t === "damage" && e.crit)) crits++;
    }
    expect(crits).toBeGreaterThan(900);
    expect(crits).toBeLessThan(1_100);
  });
});

describe("tours et orbes 気", () => {
  it("1 orbe, +1 par tour du camp, plafond 5, +1 au premier tour du second joueur", () => {
    const setup = setupOf([fighter()], [fighter()], RULES, 0);
    expect([1, 2, 3, 4, 5, 6].map((turn) => orbsFor(turn, (turn % 2 === 1 ? 0 : 1) as Side, setup))).toEqual([1, 2, 2, 2, 3, 3]);
    expect(orbsFor(19, 0, setup)).toBe(5);
  });

  it("une action par carte et par tour, deux avec 疾風", () => {
    const setup = setupOf([fighter(), fighter({ keywords: ["FLURRY"] })], [fighter({ ki: 999 }), fighter({ ki: 999 })]);
    let { state } = createState(setup);
    state = play(setup, state, { type: "ATTACK", side: 0, actor: 0, target: 0 }).state;
    expect(() => play(setup, state, { type: "ATTACK", side: 0, actor: 0, target: 0 })).toThrow("ACTOR_UNAVAILABLE");
    state = play(setup, state, { type: "ATTACK", side: 0, actor: 1, target: 0 }).state;
    state = play(setup, state, { type: "ATTACK", side: 0, actor: 1, target: 0 }).state;
    expect(() => play(setup, state, { type: "ATTACK", side: 0, actor: 1, target: 0 })).toThrow("ACTOR_UNAVAILABLE");
  });

  it("premier tour du premier joueur : limité à firstTurnActions actions, puis plus aucune limite", () => {
    const setup = setupOf(team3(), team3({ ki: 999 }), { ...FLAT_RULES, firstTurnActions: 2 });
    let { state } = createState(setup);
    state = play(setup, state, { type: "ATTACK", side: 0, actor: 0, target: 0 }).state;
    state = play(setup, state, { type: "ATTACK", side: 0, actor: 1, target: 0 }).state;
    expect(() => play(setup, state, { type: "ATTACK", side: 0, actor: 2, target: 0 })).toThrow("NO_ACTIONS_LEFT");
    expect(legalActions(setup, state, 0)).toEqual([{ type: "END_TURN", side: 0 }]);
    state = play(setup, state, { type: "END_TURN", side: 0 }).state;
    expect(state.budget).toBeNull();
    for (const actor of [0, 1, 2]) state = play(setup, state, { type: "ATTACK", side: 1, actor, target: 0 }).state;
  });

  it("refuse de jouer hors de son tour, une carte morte, une cible invalide, une technique trop chère", () => {
    const setup = setupOf(team3({ technique: "RANBU" }), team3());
    const { state } = createState(setup);
    expect(() => play(setup, state, { type: "ATTACK", side: 1, actor: 0, target: 0 })).toThrow("NOT_YOUR_TURN");
    expect(() => play(setup, state, { type: "ATTACK", side: 0, actor: 5, target: 0 })).toThrow("ACTOR_UNAVAILABLE");
    expect(() => play(setup, state, { type: "ATTACK", side: 0, actor: 0, target: 3 })).toThrow("BAD_TARGET");
    expect(() => play(setup, state, { type: "ATTACK", side: 0, actor: 0.5, target: 0 })).toThrow("ACTOR_UNAVAILABLE");
    expect(() => play(setup, state, { type: "TECHNIQUE", side: 0, actor: 0 })).toThrow("NOT_ENOUGH_ORBS");
  });

  it("fin de tour : l'autre camp joue, orbes non dépensés perdus", () => {
    const setup = setupOf(team3(), team3());
    const { state, events } = play(setup, createState(setup).state, { type: "END_TURN", side: 0 });
    expect(state.active).toBe(1);
    expect(state.turn).toBe(2);
    expect(state.orbs).toBe(2);
    expect(events).toContainEqual({ t: "turn", side: 1, turn: 2, orbs: 2 });
    expect(state.fighters[1].every((f) => f.actionsLeft === 1)).toBe(true);
  });

  it("l'état précédent n'est jamais modifié", () => {
    const setup = setupOf(team3(), team3());
    const start = createState(setup).state;
    const copy = structuredClone(start);
    play(setup, start, { type: "ATTACK", side: 0, actor: 0, target: 0 });
    expect(start).toEqual(copy);
  });
});

describe("fins de partie", () => {
  it("K.O. : le camp qui n'a plus de carte debout perd", () => {
    const setup = setupOf([fighter({ power: 999 })], [fighter({ ki: 0, power: 1 })]);
    const { state, events } = play(setup, createState(setup).state, { type: "ATTACK", side: 0, actor: 0, target: 0 });
    expect(state).toMatchObject({ finished: true, winner: 0, endReason: "KO" });
    expect(events.at(-1)).toEqual({ t: "end", winner: 0, reason: "KO" });
    expect(() => play(setup, state, { type: "END_TURN", side: 1 })).toThrow("FINISHED");
  });

  it("abandon à tout moment, même hors de son tour", () => {
    const setup = setupOf(team3(), team3());
    const { state } = play(setup, createState(setup).state, { type: "FORFEIT", side: 1 });
    expect(state).toMatchObject({ finished: true, winner: 0, endReason: "FORFEIT" });
  });

  it("tours expirés : fin de tour automatique, forfait au 2e d'affilée ; un vrai tour remet le compteur à zéro", () => {
    const setup = setupOf(team3(), team3());
    let { state } = createState(setup);
    state = play(setup, state, { type: "TIMEOUT", side: 0 }).state;
    expect(state).toMatchObject({ active: 1, missed: [1, 0], finished: false });
    state = play(setup, state, { type: "END_TURN", side: 1 }).state;
    state = play(setup, state, { type: "END_TURN", side: 0 }).state;
    expect(state.missed).toEqual([0, 0]);
    state = play(setup, state, { type: "TIMEOUT", side: 1 }).state;
    state = play(setup, state, { type: "TIMEOUT", side: 0 }).state;
    state = play(setup, state, { type: "TIMEOUT", side: 1 }).state;
    expect(state).toMatchObject({ finished: true, winner: 0, endReason: "TIMEOUT" });
  });

  it("limite de tours : le plus fort % de PV gagne, égalité = nul", () => {
    const rules = { ...FLAT_RULES, maxTurns: 2 };
    const even = setupOf(team3(), team3(), rules);
    let { state } = createState(even);
    state = play(even, state, { type: "END_TURN", side: 0 }).state;
    state = play(even, state, { type: "END_TURN", side: 1 }).state;
    expect(state).toMatchObject({ finished: true, winner: null, endReason: "TURN_LIMIT" });

    const uneven = setupOf(team3(), team3(), rules);
    state = createState(uneven).state;
    state = play(uneven, state, { type: "ATTACK", side: 0, actor: 0, target: 0 }).state;
    state = play(uneven, state, { type: "END_TURN", side: 0 }).state;
    state = play(uneven, state, { type: "END_TURN", side: 1 }).state;
    expect(state).toMatchObject({ finished: true, winner: 0, endReason: "TURN_LIMIT" });
  });
});

describe("mots-clés", () => {
  it("挑発 : les attaques doivent viser la provocation tant qu'elle vit", () => {
    const setup = setupOf(team3(), [fighter(), fighter({ keywords: ["TAUNT"] }), fighter()]);
    const { state } = createState(setup);
    expect(() => play(setup, state, { type: "ATTACK", side: 0, actor: 0, target: 0 })).toThrow("TAUNT");
    expect(() => play(setup, state, { type: "ATTACK", side: 0, actor: 0, target: 1 })).not.toThrow();
    const targets = legalActions(setup, state, 0).filter((a) => a.type === "ATTACK").map((a) => a.type === "ATTACK" && a.target);
    expect(new Set(targets)).toEqual(new Set([1]));
  });

  it("結界 : le premier coup est annulé, le suivant passe", () => {
    const setup = setupOf(team3(), [fighter({ keywords: ["BARRIER"] }), fighter(), fighter()]);
    let { state, events } = play(setup, createState(setup).state, { type: "ATTACK", side: 0, actor: 0, target: 0 });
    expect(events).toContainEqual({ t: "block", side: 1, index: 0 });
    expect(state.fighters[1][0].hp).toBe(state.fighters[1][0].maxHp);
    ({ state, events } = play(setup, state, { type: "ATTACK", side: 0, actor: 1, target: 0 }));
    expect(state.fighters[1][0].hp).toBeLessThan(state.fighters[1][0].maxHp);
  });

  it("毒 : le poison retire 8 % des PV max au début des 2 tours suivants de la cible", () => {
    const setup = setupOf([fighter({ keywords: ["POISON"] })], [fighter({ ki: 50 })]); // 160 PV → 13 par tour
    let { state } = play(setup, createState(setup).state, { type: "ATTACK", side: 0, actor: 0, target: 0 });
    const afterHit = state.fighters[1][0].hp;
    const tick = play(setup, state, { type: "END_TURN", side: 0 });
    state = tick.state;
    expect(tick.events).toContainEqual({ t: "poison", side: 1, index: 0, amount: 13, hp: afterHit - 13 });
    state = play(setup, state, { type: "END_TURN", side: 1 }).state;
    state = play(setup, state, { type: "END_TURN", side: 0 }).state;
    expect(state.fighters[1][0].hp).toBe(afterHit - 26);
    state = play(setup, state, { type: "END_TURN", side: 1 }).state;
    state = play(setup, state, { type: "END_TURN", side: 0 }).state;
    expect(state.fighters[1][0].hp).toBe(afterHit - 26);
  });

  it("反撃 : renvoie 50 % des dégâts d'une attaque simple, pas d'une technique", () => {
    const setup = setupOf([fighter({ power: 80, technique: "ISSEN" })], [fighter({ ki: 60, keywords: ["RIPOSTE"] })]);
    let { state, events } = play(setup, createState(setup).state, { type: "ATTACK", side: 0, actor: 0, target: 0 });
    expect(events).toContainEqual({ t: "damage", side: 0, index: 0, amount: 25, crit: false, hp: state.fighters[0][0].maxHp - 25 });
    state = play(setup, state, { type: "END_TURN", side: 0 }).state;
    state = play(setup, state, { type: "END_TURN", side: 1 }).state;
    ({ events } = play(setup, state, { type: "TECHNIQUE", side: 0, actor: 0, target: 0 }));
    expect(events.some((e) => e.t === "riposte")).toBe(false);
  });

  it("遺言 : à sa mort, soigne les alliés de 20 % de leurs PV max", () => {
    const setup = setupOf(
      [fighter({ power: 999 })],
      [fighter({ ki: 0, keywords: ["LAST_WILL"] }), fighter({ ki: 50 })],
    );
    const { state } = createState(setup);
    // Blesse d'abord l'allié pour voir le soin
    state.fighters[1][1].hp = 10;
    const { events } = play(setup, state, { type: "ATTACK", side: 0, actor: 0, target: 0 });
    expect(events).toContainEqual({ t: "heal", side: 1, index: 1, amount: 32, hp: 42 });
  });

  it("復活 : revient une fois avec 25 % de ses PV", () => {
    const setup = setupOf([fighter({ power: 999, keywords: ["FLURRY"] })], [fighter({ ki: 50, keywords: ["REVIVE"] }), fighter()]);
    let { state, events } = play(setup, createState(setup).state, { type: "ATTACK", side: 0, actor: 0, target: 0 });
    expect(events).toContainEqual({ t: "revive", side: 1, index: 0, hp: 40 });
    ({ state, events } = play(setup, state, { type: "ATTACK", side: 0, actor: 0, target: 0 }));
    expect(events).toContainEqual({ t: "ko", side: 1, index: 0 });
    expect(state.fighters[1][0].hp).toBe(0);
  });
});

describe("techniques 技", () => {
  /** Avance jusqu'au tour où le camp 0 a au moins `orbs` orbes. */
  function withOrbs(setup: BattleSetup, orbs: number) {
    let { state } = createState(setup);
    while (state.orbs < orbs || state.active !== 0) state = play(setup, state, { type: "END_TURN", side: state.active }).state;
    return state;
  }

  it("一閃 : coup à ×1,6 et coûte 2 orbes", () => {
    const setup = setupOf([fighter({ power: 80, technique: "ISSEN" })], [fighter({ ki: 60 })]);
    const start = withOrbs(setup, 2);
    const { state, events } = play(setup, start, { type: "TECHNIQUE", side: 0, actor: 0, target: 0 });
    expect(events).toContainEqual(expect.objectContaining({ t: "damage", amount: 80 })); // 50 × 1,6
    expect(state.orbs).toBe(start.orbs - 2);
  });

  it("貫通 : ignore la DEF", () => {
    const setup = setupOf([fighter({ power: 80, technique: "KANTSU" })], [fighter({ ki: 60 })]);
    const { events } = play(setup, withOrbs(setup, 2), { type: "TECHNIQUE", side: 0, actor: 0, target: 0 });
    expect(events).toContainEqual(expect.objectContaining({ t: "damage", amount: 80 }));
  });

  it("乱舞 : frappe tous les ennemis, sans cible", () => {
    const setup = setupOf([fighter({ technique: "RANBU" })], team3());
    const start = withOrbs(setup, 3);
    expect(() => play(setup, start, { type: "TECHNIQUE", side: 0, actor: 0, target: 0 })).toThrow("BAD_TARGET");
    const { events } = play(setup, start, { type: "TECHNIQUE", side: 0, actor: 0 });
    expect(events.filter((e) => e.t === "damage")).toHaveLength(3);
  });

  it("癒し, 守護 : visent un allié, jamais un ennemi", () => {
    const heal = setupOf([fighter({ technique: "IYASHI", ki: 50 })], [fighter()]);
    const start = withOrbs(heal, 2);
    start.fighters[0][0].hp = 100;
    const { events } = play(heal, start, { type: "TECHNIQUE", side: 0, actor: 0, target: 0 });
    expect(events).toContainEqual({ t: "heal", side: 0, index: 0, amount: 48, hp: 148 });

    const guard = setupOf([fighter({ technique: "SHUGO" }), fighter()], [fighter()]);
    const s2 = withOrbs(guard, 2);
    expect(() => play(guard, s2, { type: "TECHNIQUE", side: 0, actor: 0, target: 2 })).toThrow("BAD_TARGET");
    expect(play(guard, s2, { type: "TECHNIQUE", side: 0, actor: 0, target: 1 }).state.fighters[0][1].barrier).toBe(true);
  });

  it("鼓舞 : +20 % d'ATK aux alliés pendant ce tour et le suivant", () => {
    const setup = setupOf([fighter({ technique: "KOBU" }), fighter({ power: 80 })], [fighter({ ki: 60, power: 1 })]);
    let state = withOrbs(setup, 2);
    state = play(setup, state, { type: "TECHNIQUE", side: 0, actor: 0 }).state;
    const boosted = play(setup, state, { type: "ATTACK", side: 0, actor: 1, target: 0 });
    state = boosted.state;
    expect(boosted.events).toContainEqual(expect.objectContaining({ t: "damage", amount: 60 })); // 50 × 1,2
    state = play(setup, state, { type: "END_TURN", side: 0 }).state;
    state = play(setup, state, { type: "END_TURN", side: 1 }).state;
    expect(state.fighters[0][1].buffTurns).toBe(1);
    state = play(setup, state, { type: "END_TURN", side: 0 }).state;
    expect(state.fighters[0][1]).toMatchObject({ buffTurns: 0, buffPct: 0 });
  });

  it("封印 : la cible ne peut pas agir à son prochain tour", () => {
    const setup = setupOf([fighter({ technique: "FUIN" })], [fighter(), fighter()]);
    let state = withOrbs(setup, 3);
    state = play(setup, state, { type: "TECHNIQUE", side: 0, actor: 0, target: 1 }).state;
    state = play(setup, state, { type: "END_TURN", side: 0 }).state;
    expect(state.fighters[1].map((f) => f.actionsLeft)).toEqual([1, 0]);
    state = play(setup, state, { type: "END_TURN", side: 1 }).state;
    state = play(setup, state, { type: "END_TURN", side: 0 }).state;
    expect(state.fighters[1].map((f) => f.actionsLeft)).toEqual([1, 1]);
  });
});

describe("déterminisme et robustesse", () => {
  it("même graine + mêmes actions = mêmes événements ; replay identique à la partie jouée", () => {
    const rng = seededRng(42);
    const setup = setupOf(randomTeam(rng), randomTeam(rng), RULES);
    const { state, actions } = botGame(7, setup);
    const a = replay(setup, 7, actions);
    const b = replay(setup, 7, actions);
    expect(a).toEqual(b);
    expect(a.state).toEqual(state);
  });

  it("une autre graine donne d'autres chiffres", () => {
    const setup = setupOf(team3(), team3(), RULES);
    const s = createState(setup).state;
    const amounts = new Set(
      Array.from({ length: 20 }, (_, seed) => {
        const d = play(setup, s, { type: "ATTACK", side: 0, actor: 0, target: 0 }, seed).events.find((e) => e.t === "damage");
        return d?.t === "damage" ? d.amount : -1;
      }),
    );
    expect(amounts.size).toBeGreaterThan(1);
  });
});
