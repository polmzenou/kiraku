import { describe, expect, it } from "vitest";
import { DEFAULT_BATTLE_RULES } from "./config";
import {
  abilityPrice,
  baseKit,
  checkEquip,
  effectiveKit,
  ownedAbilities,
  sameKit,
  slotsOf,
  withAbility,
  type Kit,
} from "./loadout";
import { keywordsFor, techniqueFor } from "./stats";
import { KEYWORDS, TECHNIQUES } from "./types";

const rules = DEFAULT_BATTLE_RULES;
// Légendaire : 2 emplacements de passif avec les réglages par défaut
const legendary = { anilistId: 4242, rarity: "LEGENDARY" as const };

describe("kit d'origine et emplacements", () => {
  it("le kit d'origine est le tirage de la carte", () => {
    expect(baseKit(legendary, rules)).toEqual({
      keywords: keywordsFor(4242, "LEGENDARY", rules.keywordsByRarity, rules.newAbilityPct),
      technique: techniqueFor(4242, rules.newAbilityPct),
    });
  });

  it("le nombre d'emplacements suit la rareté, jamais plus que les passifs d'origine", () => {
    expect(slotsOf({ rarity: "COMMON" }, rules)).toBe(0);
    expect(slotsOf({ rarity: "LEGENDARY" }, rules)).toBe(2);
    expect(slotsOf({ rarity: "XR" }, { keywordsByRarity: { XR: 40 } })).toBe(7);
    expect(slotsOf({ rarity: "INCONNUE" }, rules)).toBe(0);
  });
});

describe("capacités acquises", () => {
  const base: Kit = { keywords: ["BARRIER", "POISON"], technique: "ISSEN" };

  it("le kit d'origine est acquis d'office, sans achat", () => {
    const owned = ownedAbilities(base, []);
    expect([...owned.keywords]).toEqual(["BARRIER", "POISON"]);
    expect([...owned.techniques]).toEqual(["ISSEN"]);
  });

  it("les achats s'ajoutent, une capacité inconnue ou d'un autre type est ignorée", () => {
    const owned = ownedAbilities(base, [
      { kind: "KEYWORD", ability: "FLURRY" },
      { kind: "TECHNIQUE", ability: "KONSHIN" },
      { kind: "KEYWORD", ability: "ISSEN" }, // technique rangée en passif
      { kind: "KEYWORD", ability: "RETIREE" },
      { kind: "AUTRE", ability: "REVIVE" },
    ]);
    expect([...owned.keywords].sort()).toEqual(["BARRIER", "FLURRY", "POISON"]);
    expect([...owned.techniques].sort()).toEqual(["ISSEN", "KONSHIN"]);
  });
});

describe("kit qui combat", () => {
  const base: Kit = { keywords: ["BARRIER", "POISON"], technique: "ISSEN" };
  const owned = ownedAbilities(base, [
    { kind: "KEYWORD", ability: "FLURRY" },
    { kind: "KEYWORD", ability: "REVIVE" },
    { kind: "TECHNIQUE", ability: "KONSHIN" },
  ]);

  it("sans kit choisi : le kit d'origine", () => {
    expect(effectiveKit(base, null, owned, 2)).toEqual(base);
  });

  it("respecte les emplacements et l'ordre choisi", () => {
    expect(effectiveKit(base, { keywords: ["REVIVE", "FLURRY"], technique: "KONSHIN" }, owned, 2)).toEqual({
      keywords: ["REVIVE", "FLURRY"],
      technique: "KONSHIN",
    });
  });

  it("complète un emplacement manquant avec le kit d'origine", () => {
    expect(effectiveKit(base, { keywords: ["FLURRY"], technique: "ISSEN" }, owned, 2)).toEqual({ keywords: ["FLURRY", "BARRIER"], technique: "ISSEN" });
  });

  it("écarte une capacité inconnue, non acquise ou en double, puis complète", () => {
    const kit = effectiveKit(base, { keywords: ["RETIREE", "LIFESTEAL", "FLURRY", "FLURRY"], technique: "RENGEKI" }, owned, 2);
    expect(kit).toEqual({ keywords: ["FLURRY", "BARRIER"], technique: "ISSEN" });
  });

  it("une technique inconnue ou non acquise retombe sur celle d'origine", () => {
    expect(effectiveKit(base, { keywords: ["BARRIER", "POISON"], technique: "ULTI" }, owned, 2).technique).toBe("ISSEN");
    expect(effectiveKit(base, { keywords: ["BARRIER", "POISON"], technique: "DOKUGIRI" }, owned, 2).technique).toBe("ISSEN");
  });

  it("l'admin baisse les emplacements : le kit est coupé, les achats restent acquis", () => {
    const fewer: Kit = { keywords: ["BARRIER"], technique: "ISSEN" };
    const stillOwned = ownedAbilities(fewer, [
      { kind: "KEYWORD", ability: "FLURRY" },
      { kind: "KEYWORD", ability: "REVIVE" },
    ]);
    expect(effectiveKit(fewer, { keywords: ["REVIVE", "FLURRY"], technique: "ISSEN" }, stillOwned, 1)).toEqual({ keywords: ["REVIVE"], technique: "ISSEN" });
    // Un passif d'origine qui n'est plus tiré n'est plus acquis : il retombe sur le nouveau tirage
    expect(effectiveKit(fewer, { keywords: ["POISON"], technique: "ISSEN" }, stillOwned, 1)).toEqual({ keywords: ["BARRIER"], technique: "ISSEN" });
  });

  it("l'admin monte les emplacements : le nouvel emplacement vient du kit d'origine", () => {
    const more: Kit = { keywords: ["BARRIER", "POISON", "RIPOSTE"], technique: "ISSEN" };
    const o = ownedAbilities(more, [{ kind: "KEYWORD", ability: "FLURRY" }]);
    expect(effectiveKit(more, { keywords: ["FLURRY", "POISON"], technique: "ISSEN" }, o, 3)).toEqual({ keywords: ["FLURRY", "POISON", "BARRIER"], technique: "ISSEN" });
  });

  it("une Commune n'a aucun passif, même avec des achats ou un kit enregistré", () => {
    const common: Kit = { keywords: [], technique: "FUIN" };
    const o = ownedAbilities(common, [{ kind: "KEYWORD", ability: "FLURRY" }, { kind: "TECHNIQUE", ability: "ISSEN" }]);
    expect(effectiveKit(common, { keywords: ["FLURRY"], technique: "ISSEN" }, o, 0)).toEqual({ keywords: [], technique: "ISSEN" });
  });

  it("un emplacement n'est jamais vide, quel que soit le kit enregistré", () => {
    for (const card of [1, 77, 4242, 90_001].flatMap((id) => (["RARE", "LEGENDARY", "GOLD", "XR"] as const).map((rarity) => ({ anilistId: id, rarity })))) {
      const b = baseKit(card, rules);
      const kit = effectiveKit(b, { keywords: ["RETIREE", "RETIREE"], technique: "?" }, ownedAbilities(b, []), slotsOf(card, rules));
      expect(kit.keywords).toHaveLength(slotsOf(card, rules));
      expect(new Set(kit.keywords).size).toBe(kit.keywords.length);
      expect(TECHNIQUES).toContain(kit.technique);
    }
  });
});

describe("équipement demandé par le joueur", () => {
  const base: Kit = { keywords: ["BARRIER", "POISON"], technique: "ISSEN" };
  const owned = ownedAbilities(base, [
    { kind: "KEYWORD", ability: "FLURRY" },
    { kind: "TECHNIQUE", ability: "KONSHIN" },
  ]);

  it("accepte un kit complet fait de capacités acquises", () => {
    expect(checkEquip({ keywords: ["FLURRY", "POISON"], technique: "KONSHIN" }, owned, 2)).toEqual({ keywords: ["FLURRY", "POISON"], technique: "KONSHIN" });
  });

  it.each([
    ["un emplacement vide", { keywords: ["FLURRY"], technique: "ISSEN" }],
    ["un emplacement de trop", { keywords: ["FLURRY", "POISON", "BARRIER"], technique: "ISSEN" }],
    ["un doublon", { keywords: ["FLURRY", "FLURRY"], technique: "ISSEN" }],
    ["un passif non acquis", { keywords: ["REVIVE", "POISON"], technique: "ISSEN" }],
    ["un passif inconnu", { keywords: ["ULTI", "POISON"], technique: "ISSEN" }],
    ["une technique non acquise", { keywords: ["BARRIER", "POISON"], technique: "RANBU" }],
    ["une technique inconnue", { keywords: ["BARRIER", "POISON"], technique: "ULTI" }],
  ])("refuse %s", (_, next) => {
    expect(checkEquip(next, owned, 2)).toBeNull();
  });

  it("place une capacité dans un emplacement, sans doublon ni emplacement inexistant", () => {
    expect(withAbility(base, "KEYWORD", "FLURRY", 1)).toEqual({ keywords: ["BARRIER", "FLURRY"], technique: "ISSEN" });
    expect(withAbility(base, "TECHNIQUE", "KONSHIN", 0)).toEqual({ keywords: ["BARRIER", "POISON"], technique: "KONSHIN" });
    expect(withAbility(base, "KEYWORD", "POISON", 0)).toBeNull();
    expect(withAbility(base, "KEYWORD", "FLURRY", 2)).toBeNull();
    expect(withAbility(base, "KEYWORD", "FLURRY", -1)).toBeNull();
    expect(withAbility(base, "TECHNIQUE", "KONSHIN", 1)).toBeNull();
    expect(withAbility({ keywords: [], technique: "ISSEN" }, "KEYWORD", "FLURRY", 0)).toBeNull();
  });

  it("compare deux kits sans tenir compte de l'ordre des emplacements", () => {
    expect(sameKit(base, { keywords: ["POISON", "BARRIER"], technique: "ISSEN" })).toBe(true);
    expect(sameKit(base, { keywords: ["POISON", "FLURRY"], technique: "ISSEN" })).toBe(false);
    expect(sameKit(base, { keywords: ["BARRIER", "POISON"], technique: "KANTSU" })).toBe(false);
  });
});

describe("prix de l'atelier", () => {
  it("chaque capacité a un prix par défaut positif, Rafale la plus chère des passifs", () => {
    for (const k of KEYWORDS) expect(abilityPrice(rules.abilityPrices, "KEYWORD", k)).toBeGreaterThan(0);
    for (const t of TECHNIQUES) expect(abilityPrice(rules.abilityPrices, "TECHNIQUE", t)).toBeGreaterThan(0);
    const keywordPrices = KEYWORDS.map((k) => rules.abilityPrices.keywords[k]);
    expect(rules.abilityPrices.keywords.FLURRY).toBe(Math.max(...keywordPrices));
    expect(abilityPrice(rules.abilityPrices, "KEYWORD", "FLURRY")).toBe(3_650);
    expect(abilityPrice(rules.abilityPrices, "TECHNIQUE", "KONSHIN")).toBe(800);
  });
});
