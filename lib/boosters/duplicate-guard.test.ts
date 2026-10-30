import { describe, expect, it } from "vitest";
import type { Rarity } from "@/lib/catalog/rarity";
import { drawBoosters, drawSealed, featuredFromPool, guardState, pickCard, type CardPool, type DrawnCard, type DrawRules, type DuplicateGuard } from "./draw";
import { DEFAULT_RULES, DEFAULT_RUIN, fakePool, NO_BONUS } from "./fixtures";
import { seededRng, type Rng } from "./rng";
import { SETTING_DEFAULTS, SETTING_SCHEMAS } from "@/lib/settings/defaults";

// Doublons des grandes raretés : une carte protégée déjà possédée n'a plus qu'une chance sur N de
// ses chances normales, et plus aucune à partir de B exemplaires.

const GUARD: DuplicateGuard = { rarities: ["MYTHIC", "AR", "GOLD"], divisor: 1_000_000, blockAt: 2 };
const noBonus: DrawRules = { ...DEFAULT_RULES, ...NO_BONUS, pityThreshold: 1_000_000 };
/** Toutes les parts sur une rareté : chaque emplacement la tire. */
const only = (rarity: Rarity) => Object.fromEntries(Object.keys(DEFAULT_RULES.rates).map((r) => [r, r === rarity ? 1 : 0]));
const forced = (rarity: Rarity, over: Partial<DrawRules> = {}): DrawRules => ({ ...noBonus, rates: only(rarity), duplicateGuard: GUARD, ...over });
const ids = (cards: DrawnCard[]) => cards.map((c) => c.cardId);
const allCards = (boosters: { cards: DrawnCard[] }[]) => boosters.flatMap((b) => ids(b.cards));
const tally = (cards: string[]) => cards.reduce((m, id) => m.set(id, (m.get(id) ?? 0) + 1), new Map<string, number>());
const lowest: Rng = () => 0;

describe("doublons des grandes raretés", () => {
  it("sans carte protégée possédée ni tirée, le tirage est identique à celui d'avant", () => {
    const pool = fakePool();
    const state = { pityCount: 0, standardCount: 0 };
    const plain = drawBoosters(seededRng(42), { pool, rules: noBonus, state, count: 20 });
    const guarded = drawBoosters(seededRng(42), { pool, rules: { ...noBonus, duplicateGuard: GUARD }, state, count: 20, owned: new Map() });
    expect(allCards(plain.boosters).some((id) => /^(MYTHIC|AR|GOLD)-/.test(id))).toBe(false);
    expect(guarded).toEqual(plain);
  });

  it("une carte bloquée (2 exemplaires) ne sort jamais, et aucune ne dépasse 2 exemplaires", () => {
    const pool = fakePool(3);
    const owned = new Map([["MYTHIC-0", 2]]);
    const { boosters } = drawBoosters(seededRng(1), { pool, rules: forced("MYTHIC"), state: { pityCount: 0, standardCount: 0 }, count: 500, owned });
    const counts = tally(allCards(boosters));
    expect(counts.has("MYTHIC-0")).toBe(false);
    expect(counts.get("MYTHIC-1")).toBeLessThanOrEqual(2);
    expect(counts.get("MYTHIC-2")).toBeLessThanOrEqual(2);
    // Une fois toutes les Mythiques prises, l'emplacement descend d'une rareté
    expect(boosters.at(-1)!.cards.every((c) => c.rarity === "LEGENDARY")).toBe(true);
  });

  it("une carte possédée une fois sort N fois moins, même seule de sa rareté", () => {
    const pool: CardPool = { ...fakePool(), MYTHIC: ["seule"] };
    const rules = forced("MYTHIC", { duplicateGuard: { ...GUARD, divisor: 10, blockAt: 0 } });
    const { boosters } = drawBoosters(seededRng(9), { pool, rules, state: { pityCount: 0, standardCount: 0 }, count: 1_000, owned: new Map([["seule", 1]]) });
    const hits = tally(allCards(boosters)).get("seule") ?? 0;
    // 4 000 emplacements, une chance sur 10 chacun
    expect(hits).toBeGreaterThan(320);
    expect(hits).toBeLessThan(480);
    // Les emplacements refusés descendent d'une rareté (aucune autre Mythique à donner)
    expect(allCards(boosters).filter((id) => id.startsWith("LEGENDARY-")).length).toBe(4_000 - hits);
  });

  it("toutes les Mythiques bloquées : la pitié donne une Légendaire et son compteur continue", () => {
    const pool = fakePool(2);
    const owned = new Map([["MYTHIC-0", 2], ["MYTHIC-1", 2]]);
    const rules: DrawRules = { ...DEFAULT_RULES, ...NO_BONUS, duplicateGuard: GUARD };
    const { boosters, state } = drawBoosters(lowest, { pool, rules, state: { pityCount: 249, standardCount: 0 }, count: 1, owned });
    expect(boosters[0].pityTriggered).toBe(true);
    expect(boosters[0].cards.at(-1)!.rarity).toBe("LEGENDARY");
    expect(state.pityCount).toBe(250);
  });

  it("une même ouverture ne donne jamais deux fois la même carte protégée", () => {
    const pool: CardPool = { ...fakePool(), MYTHIC: ["a", "b"] };
    for (let seed = 1; seed <= 30; seed++) {
      const { boosters } = drawBoosters(seededRng(seed), { pool, rules: forced("MYTHIC"), state: { pityCount: 0, standardCount: 0 }, count: 3, owned: new Map() });
      const cards = allCards(boosters);
      expect(cards.filter((id) => id === "a")).toHaveLength(1);
      expect(cards.filter((id) => id === "b")).toHaveLength(1);
    }
  });

  it("une carte remplacée par la pitié n'est pas comptée comme possédée", () => {
    // Raretés protégées : Rare seulement, bloquée dès le premier exemplaire
    const pool: CardPool = { ...fakePool(), RARE: ["R"] };
    const rules = forced("RARE", { slotFloors: ["RARE"], pityThreshold: 2, duplicateGuard: { rarities: ["RARE"], divisor: 1_000_000, blockAt: 1 } });
    const { boosters } = drawBoosters(seededRng(3), { pool, rules, state: { pityCount: 1, standardCount: 0 }, count: 2, owned: new Map() });
    // Premier booster : R tirée puis remplacée par la Mythique de la pitié ; R reste donc à donner
    expect(boosters[0].pityTriggered).toBe(true);
    expect(boosters[0].cards[0].rarity).toBe("MYTHIC");
    expect(ids(boosters[1].cards)).toEqual(["R"]);
  });

  it("la pitié vedette ne force pas une vedette déjà possédée, et des vedettes bloquées laissent le tirage normal", () => {
    const pool = fakePool();
    const featured = featuredFromPool(["MYTHIC-0"], pool, { rate: 10_000, pityThreshold: 1 })!;
    const rules: DrawRules = { ...DEFAULT_RULES, ...NO_BONUS, duplicateGuard: GUARD };
    for (const copies of [1, 2]) {
      const { boosters } = drawBoosters(seededRng(5), { pool, rules, state: { pityCount: 0, standardCount: 0, featuredCount: 0 }, count: 300, featured, owned: new Map([["MYTHIC-0", copies]]) });
      expect(allCards(boosters)).not.toContain("MYTHIC-0");
      expect(boosters.every((b) => !b.featuredPityTriggered && b.cards.length === 4)).toBe(true);
    }
  });

  it("la vedette encore jamais tirée garde sa pitié", () => {
    const pool = fakePool();
    const featured = featuredFromPool(["MYTHIC-0", "MYTHIC-1"], pool, { rate: 0, pityThreshold: 1 })!;
    const rules: DrawRules = { ...DEFAULT_RULES, ...NO_BONUS, duplicateGuard: GUARD };
    const { boosters } = drawBoosters(seededRng(8), { pool, rules, state: { pityCount: 0, standardCount: 0, featuredCount: 0 }, count: 1, featured, owned: new Map([["MYTHIC-0", 1]]) });
    expect(boosters[0].featuredPityTriggered).toBe(true);
    expect(ids(boosters[0].cards)).toContain("MYTHIC-1");
  });

  it("sachet Divin : les Mythiques bloquées ne sortent pas, la dernière carte descend d'une rareté", () => {
    const pool = fakePool(2);
    const owned = new Map([["MYTHIC-0", 2], ["MYTHIC-1", 2]]);
    const rules: DrawRules = { ...DEFAULT_RULES, rates: only("MYTHIC"), duplicateGuard: GUARD };
    for (let seed = 1; seed <= 50; seed++) {
      const { cards } = drawSealed(seededRng(seed), { kind: "divin", pool, rules, ruin: DEFAULT_RUIN, karma: 0, owned });
      expect(ids(cards).some((id) => id.startsWith("MYTHIC-"))).toBe(false);
      expect(cards.at(-1)!.rarity).toBe("LEGENDARY");
    }
  });

  it("le tirage d'une carte au hasard (lots) suit la même règle", () => {
    const pool: CardPool = { ...fakePool(), MYTHIC: ["x", "y"] };
    const guard = guardState(GUARD, new Map([["x", 2]]), pool);
    for (let seed = 1; seed <= 20; seed++) expect(pickCard(seededRng(seed), pool, "MYTHIC", {}, undefined, guard).cardId).toBe("y");
    guard!.take("y");
    guard!.take("y");
    expect(pickCard(seededRng(1), pool, "MYTHIC", {}, undefined, guard).rarity).toBe("LEGENDARY");
  });

  it("ne suit rien quand aucune rareté protégée n'est dans le pool, ou quand la règle est coupée", () => {
    expect(guardState({ ...GUARD, rarities: [] }, new Map([["MYTHIC-0", 5]]), fakePool())).toBeNull();
    expect(guardState(GUARD, new Map(), fakePool(10, ["MYTHIC", "AR", "GOLD"]))).toBeNull();
    expect(guardState(undefined, new Map(), fakePool())).toBeNull();
  });

  it("réglages par défaut : Mythique, AR et Gold, une chance sur 10 000, plus aucune en double", () => {
    expect(SETTING_DEFAULTS["booster.duplicateGuardRarities"]).toEqual(["MYTHIC", "AR", "GOLD"]);
    expect(SETTING_DEFAULTS["booster.duplicateGuardDivisor"]).toBe(10_000);
    expect(SETTING_DEFAULTS["booster.duplicateGuardBlockAt"]).toBe(2);
    expect(SETTING_SCHEMAS["booster.duplicateGuardRarities"].safeParse([]).success).toBe(true);
    expect(SETTING_SCHEMAS["booster.duplicateGuardRarities"].safeParse(["MYTHIC", "MYTHIC"]).success).toBe(false);
    expect(SETTING_SCHEMAS["booster.duplicateGuardDivisor"].safeParse(0).success).toBe(false);
    expect(SETTING_SCHEMAS["booster.duplicateGuardDivisor"].safeParse(2.5).success).toBe(false);
    expect(SETTING_SCHEMAS["booster.duplicateGuardBlockAt"].safeParse(11).success).toBe(false);
  });
});
