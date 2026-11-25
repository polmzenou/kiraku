import { describe, expect, it } from "vitest";
import { VARIANT_RARITIES, type Rarity } from "@/lib/catalog/rarity";
import { drawBoosters, GuaranteeEmptyError, pickGuaranteed, rarityIndex, type DrawRules, type DuplicateGuard } from "./draw";
import { DEFAULT_RULES, fakePool, NO_BONUS } from "./fixtures";
import { GUARANTEE_GRANT_MAX, guaranteedPoolCount, guaranteeGrantSchema } from "./guaranteed";
import { seededRng } from "./rng";

// Boosters garantis : 3 cartes Épique ou mieux, puis la carte de la rareté garantie, toujours.

const E = "EPIC";
const RULES: DrawRules = { ...DEFAULT_RULES, ...NO_BONUS, slotFloors: [E, E, E, E] };
// Ouvert depuis un crédit : ni doré, ni sachet scellé, ni pitié (réglages du seed)
const BONUSES = { golden: false, drop: false, pity: false, pityReset: false };
const state = { pityCount: 0, standardCount: 0 };
const order = Object.keys(DEFAULT_RULES.rates);
const GUARD: DuplicateGuard = { rarities: [...VARIANT_RARITIES], divisor: 1_000_000, blockAt: 2 };

const open = (guaranteed: Rarity, seed: number, extra: Partial<Parameters<typeof drawBoosters>[1]> = {}) =>
  drawBoosters(seededRng(seed), { pool: fakePool(), rules: RULES, state, count: 1, bonuses: BONUSES, guaranteed, ...extra }).boosters[0];

describe("booster garanti", () => {
  it.each([...VARIANT_RARITIES])("la dernière carte est toujours %s, sur 300 ouvertures", (rarity) => {
    for (let seed = 1; seed <= 300; seed++) {
      const booster = open(rarity, seed);
      expect(booster.cards).toHaveLength(4);
      expect(booster.cards.at(-1)!.rarity).toBe(rarity);
      expect(booster.cards.at(-1)!.cardId.startsWith(`${rarity}-`)).toBe(true);
    }
  });

  it("les trois autres cartes sont Épique ou mieux", () => {
    for (let seed = 1; seed <= 300; seed++) {
      for (const card of open("XR", seed).cards.slice(0, 3)) expect(rarityIndex(card.rarity, order)).toBeGreaterThanOrEqual(rarityIndex(E, order));
    }
  });

  it("préfère une carte jamais possédée", () => {
    const pool = { ...fakePool(), XR: ["XR-a", "XR-b"] };
    const owned = new Map([["XR-a", 1]]);
    for (let seed = 1; seed <= 100; seed++) {
      const booster = drawBoosters(seededRng(seed), { pool, rules: { ...RULES, duplicateGuard: GUARD }, state, count: 1, bonuses: BONUSES, guaranteed: "XR", owned }).boosters[0];
      expect(booster.cards.at(-1)!.cardId).toBe("XR-b");
    }
  });

  it("donne une carte bloquée par les doublons plutôt qu'une autre rareté", () => {
    const pool = { ...fakePool(), XR: ["XR-a"] };
    const owned = new Map([["XR-a", 5]]);
    const booster = drawBoosters(seededRng(7), { pool, rules: { ...RULES, duplicateGuard: GUARD }, state, count: 1, bonuses: BONUSES, guaranteed: "XR", owned }).boosters[0];
    expect(booster.cards.at(-1)).toEqual({ cardId: "XR-a", rarity: "XR" });
  });

  it("chaque booster d'une ouverture multiple a sa carte garantie", () => {
    const { boosters } = drawBoosters(seededRng(3), { pool: fakePool(), rules: RULES, state, count: 5, bonuses: BONUSES, guaranteed: "GOLD" });
    expect(boosters.map((b) => b.cards.at(-1)!.rarity)).toEqual(["GOLD", "GOLD", "GOLD", "GOLD", "GOLD"]);
  });

  it("refuse de s'ouvrir sans aucune carte de sa rareté, au lieu de donner autre chose", () => {
    expect(() => open("MR", 1, { pool: fakePool(10, ["MR"]) })).toThrow(GuaranteeEmptyError);
    expect(() => pickGuaranteed(seededRng(1), fakePool(10, ["SR"]), "SR")).toThrow("GUARANTEE_EMPTY");
  });

  it("un booster ordinaire n'est pas touché", () => {
    const plain = drawBoosters(seededRng(11), { pool: fakePool(), rules: RULES, state, count: 1, bonuses: BONUSES }).boosters[0];
    const nul = drawBoosters(seededRng(11), { pool: fakePool(), rules: RULES, state, count: 1, bonuses: BONUSES, guaranteed: null }).boosters[0];
    expect(nul).toEqual(plain);
  });

  it("la pitié Mythique ne remplace jamais la carte garantie", () => {
    // Pitié due et tirage sans Mythique (rareté garantie sous Mythique, cas d'un réglage futur)
    const booster = drawBoosters(seededRng(5), {
      pool: fakePool(),
      rules: { ...RULES, pityThreshold: 1, slotFloors: ["COMMON", "COMMON", "COMMON", "COMMON"], rates: { ...DEFAULT_RULES.rates, MYTHIC: 0, AR: 0, GOLD: 0 } },
      state,
      count: 1,
      bonuses: { golden: false, drop: false, pity: true },
      guaranteed: "RARE",
    }).boosters[0];
    expect(booster.pityTriggered).toBe(true);
    expect(booster.cards.at(-1)!.rarity).toBe("RARE");
    expect(booster.cards.at(-2)!.rarity).toBe("MYTHIC");
  });
});

describe("don d'un booster garanti (admin)", () => {
  const ok = { slug: "garanti-xr", username: "Sakura_42", quantity: 3, reason: "Gagnant du concours", message: "Bravo !" };

  it("accepte un don complet et nettoie le mot au joueur", () => {
    const parsed = guaranteeGrantSchema.parse({ ...ok, message: "  " });
    expect(parsed).toMatchObject({ slug: "garanti-xr", quantity: 3, message: null });
  });

  it("refuse une quantité hors bornes, un slug ou un pseudo invalides, une raison vide, un champ en trop", () => {
    expect(guaranteeGrantSchema.safeParse({ ...ok, quantity: 0 }).success).toBe(false);
    expect(guaranteeGrantSchema.safeParse({ ...ok, quantity: GUARANTEE_GRANT_MAX + 1 }).success).toBe(false);
    expect(guaranteeGrantSchema.safeParse({ ...ok, quantity: 1.5 }).success).toBe(false);
    expect(guaranteeGrantSchema.safeParse({ ...ok, slug: "Garanti XR" }).success).toBe(false);
    expect(guaranteeGrantSchema.safeParse({ ...ok, username: "a b" }).success).toBe(false);
    expect(guaranteeGrantSchema.safeParse({ ...ok, reason: "  " }).success).toBe(false);
    expect(guaranteeGrantSchema.safeParse({ ...ok, userId: "x" }).success).toBe(false);
  });

  it("compte les cartes de la rareté dans le pool, 0 pour une donnée absente ou invalide", () => {
    expect(guaranteedPoolCount({ XR: 12, MYTHIC: 40 }, "XR")).toBe(12);
    expect(guaranteedPoolCount({ MYTHIC: 40 }, "XR")).toBe(0);
    expect(guaranteedPoolCount({ XR: "12" }, "XR")).toBe(0);
    expect(guaranteedPoolCount({ XR: -3 }, "XR")).toBe(0);
    expect(guaranteedPoolCount(null, "XR")).toBe(0);
  });
});
