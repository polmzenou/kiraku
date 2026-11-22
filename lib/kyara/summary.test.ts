import { describe, expect, it } from "vitest";
import { BASE_DEFINITIONS } from "@/lib/catalog/definitions";
import { SETTING_DEFAULTS } from "@/lib/settings/defaults";
import { planKyaraImport } from "./plan";
import { importSummary, parseImportSummary, SUMMARY_TOP_CARDS } from "./summary";

const SORT = new Map(BASE_DEFINITIONS.map((d) => [d.key, d.sortOrder]));

describe("résumé d'un import versé", () => {
  it("compte les cartes par rareté et garde les plus rares en premier, puis se relit à l'identique", () => {
    const rarities = ["COMMON", "MYTHIC", "RARE", "MYTHIC", "EPIC"];
    const plan = planKyaraImport({
      entries: rarities.map((_, i) => ({ anilistId: i + 1, qty: 2, code: "M" as const })),
      catalog: new Map(rarities.map((r, i) => [i + 1, { cardId: `c${i}`, rarity: r, published: true }])),
      owned: new Set(),
      sortOrder: SORT,
      zeniByCode: SETTING_DEFAULTS["kyaraImport.zeniByRarity"],
      recycleValues: SETTING_DEFAULTS["collection.recycleValues"],
      zeniCap: 10_000,
    });
    const summary = importSummary(plan, SORT);
    expect(summary.byRarity).toEqual({ COMMON: 1, MYTHIC: 2, RARE: 1, EPIC: 1 });
    expect(summary.top).toEqual(["c1", "c3", "c4", "c2", "c0"]);
    expect(summary.extraCopies).toBe(5);
    expect(parseImportSummary(JSON.parse(JSON.stringify(summary)))).toEqual(summary);
  });

  it("ne garde que quelques vignettes, et refuse un résumé d'une autre forme", () => {
    const empty = planKyaraImport({
      entries: [],
      catalog: new Map(),
      owned: new Set(),
      sortOrder: SORT,
      zeniByCode: SETTING_DEFAULTS["kyaraImport.zeniByRarity"],
      recycleValues: {},
      zeniCap: 0,
    });
    const plan = { ...empty, grant: Array.from({ length: 40 }, (_, i) => ({ cardId: `c${i}`, rarity: "COMMON" })) };
    expect(importSummary(plan, SORT).top).toHaveLength(SUMMARY_TOP_CARDS);
    expect(parseImportSummary(null)).toBeNull();
    expect(parseImportSummary({ byKind: {}, byRarity: {}, extraCopies: -1, capped: false, top: [] })).toBeNull();
  });
});
