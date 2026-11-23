import { describe, expect, it } from "vitest";
import { BASE_DEFINITIONS } from "@/lib/catalog/definitions";
import { SETTING_DEFAULTS } from "@/lib/settings/defaults";
import { mergeEntries, planKyaraImport, type KyaraCatalogCard, type KyaraEntry, type KyaraPlanInput } from "./plan";

const SORT = new Map(BASE_DEFINITIONS.map((d) => [d.key, d.sortOrder]));
const RECYCLE = SETTING_DEFAULTS["collection.recycleValues"];
const ZENI = SETTING_DEFAULTS["kyaraImport.zeniByRarity"];

const card = (cardId: string, rarity: string, published = true): KyaraCatalogCard => ({ cardId, rarity, published });

function input(entries: KyaraEntry[], catalog: [number, KyaraCatalogCard][], p: Partial<KyaraPlanInput> = {}): KyaraPlanInput {
  return { entries, catalog: new Map(catalog), owned: new Set(), sortOrder: SORT, zeniByCode: ZENI, recycleValues: RECYCLE, zeniCap: 10_000, ...p };
}

describe("plan d'un import Kyara", () => {
  it("donne la carte de base quand elle n'est pas plus rare chez nous, rareté égale ou inférieure", () => {
    const plan = planKyaraImport(
      input(
        [
          { anilistId: 40, qty: 1, code: "M" },
          { anilistId: 41, qty: 1, code: "E" },
        ],
        [
          [40, card("luffy", "MYTHIC")],
          [41, card("zoro", "RARE")],
        ],
      ),
    );
    expect(plan.grant).toEqual([
      { cardId: "luffy", rarity: "MYTHIC" },
      { cardId: "zoro", rarity: "RARE" },
    ]);
    expect(plan.zeni).toBe(0);
    expect(plan.byKind.CARD).toEqual({ count: 2, zeni: 0 });
  });

  it("plafond Kyara : plus rare chez nous, le joueur reçoit les Zeni de la rareté Kyara", () => {
    const plan = planKyaraImport(input([{ anilistId: 40, qty: 1, code: "R" }], [[40, card("gojo", "MYTHIC")]]));
    expect(plan.grant).toEqual([]);
    expect(plan.outcomes[0]).toMatchObject({ kind: "ABOVE", cardId: "gojo", zeni: ZENI.R });
  });

  it("le plafond passe avant « déjà possédée » : une Commune Kyara ne vaut jamais le prix d'une Mythique", () => {
    const plan = planKyaraImport(input([{ anilistId: 40, qty: 1, code: "C" }], [[40, card("gojo", "MYTHIC")]], { owned: new Set(["gojo"]) }));
    expect(plan.outcomes[0]).toMatchObject({ kind: "ABOVE", zeni: ZENI.C });
  });

  it("déjà possédée : la valeur de recyclage de notre rareté", () => {
    const plan = planKyaraImport(input([{ anilistId: 40, qty: 3, code: "L" }], [[40, card("nami", "EPIC")]], { owned: new Set(["nami"]) }));
    expect(plan.outcomes[0]).toMatchObject({ kind: "OWNED", zeni: RECYCLE.EPIC });
    expect(plan.grant).toEqual([]);
  });

  it("absente ou non publiée : Zeni de la rareté Kyara", () => {
    const plan = planKyaraImport(
      input(
        [
          { anilistId: 1, qty: 1, code: "M" },
          { anilistId: 2, qty: 1, code: "L" },
        ],
        [[2, card("brouillon", "LEGENDARY", false)]],
      ),
    );
    expect(plan.outcomes.map((o) => [o.kind, o.zeni])).toEqual([
      ["MISSING", ZENI.M],
      ["UNPUBLISHED", ZENI.L],
    ]);
    expect(plan.zeniRaw).toBe(ZENI.M + ZENI.L);
  });

  it("une rareté inconnue du registre ne donne jamais la carte", () => {
    const plan = planKyaraImport(input([{ anilistId: 40, qty: 1, code: "M" }], [[40, card("x", "INCONNUE")]]));
    expect(plan.outcomes[0].kind).toBe("ABOVE");
  });

  it("suit l'ordre du registre, même modifié", () => {
    const swapped = new Map(SORT).set("RARE", 900);
    const plan = planKyaraImport(input([{ anilistId: 40, qty: 1, code: "M" }], [[40, card("x", "RARE")]], { sortOrder: swapped }));
    expect(plan.outcomes[0].kind).toBe("ABOVE");
  });

  it("une copie par personnage : les copies en plus sont comptées mais ne rapportent rien", () => {
    const plan = planKyaraImport(
      input(
        [
          { anilistId: 40, qty: 2, code: "M" },
          { anilistId: 40, qty: 3, code: "M" },
          { anilistId: 41, qty: 1, code: "C" },
        ],
        [[40, card("luffy", "MYTHIC")]],
      ),
    );
    expect(plan.grant).toHaveLength(1);
    expect(plan.extraCopies).toBe(4);
  });

  it("plafond de Zeni par import", () => {
    const entries: KyaraEntry[] = Array.from({ length: 100 }, (_, i) => ({ anilistId: i + 1, qty: 1, code: "M" }));
    const plan = planKyaraImport(input(entries, [], { zeniCap: 1_000 }));
    expect(plan.zeniRaw).toBe(100 * ZENI.M);
    expect(plan).toMatchObject({ zeni: 1_000, capped: true });
    expect(planKyaraImport(input(entries, [], { zeniCap: 0 })).zeni).toBe(0);
    expect(planKyaraImport(input(entries, [], { zeniCap: 1_000_000 })).capped).toBe(false);
  });

  it("résultat stable, trié par personnage, quel que soit l'ordre de lecture", () => {
    const entries: KyaraEntry[] = [
      { anilistId: 9, qty: 1, code: "C" },
      { anilistId: 3, qty: 1, code: "U" },
    ];
    expect(mergeEntries(entries).map((e) => e.anilistId)).toEqual([3, 9]);
    expect(planKyaraImport(input(entries, [])).outcomes).toEqual(planKyaraImport(input([...entries].reverse(), [])).outcomes);
  });
});
