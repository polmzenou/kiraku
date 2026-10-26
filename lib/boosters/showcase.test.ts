import { describe, expect, it } from "vitest";
import {
  familyRows,
  firstSelectable,
  groupByFamily,
  initialSelection,
  normalizeSearch,
  positionInFamily,
  searchEntries,
  type ShowcaseEntry,
} from "./showcase";
import { BOOSTER_FAMILIES, type BoosterFamily } from "./types";

const e = (slug: string, family: BoosterFamily, name: string, selectable = true, tagline = ""): ShowcaseEntry => ({
  slug,
  family,
  name,
  tagline,
  selectable,
});

const ENTRIES: ShowcaseEntry[] = [
  e("standard", "standard", "Tout anime", true, "Tous les persos"),
  e("pochibukuro", "formats", "Pochibukuro"),
  e("jubako", "formats", "Jūbako"),
  e("shonen", "demographie", "Shōnen", true, "Œuvres shōnen"),
  e("seinen", "demographie", "Seinen"),
  e("shojo", "demographie", "Shōjo", false),
  e("josei", "demographie", "Josei", false),
  e("isekai", "genre", "Isekai", true, "Un autre monde"),
  e("sport", "genre", "Sport", false),
  e("banniere", "special", "Bannière vedette"),
];
const TITLES: Record<BoosterFamily, string> = {
  standard: "Standard",
  formats: "Formats",
  rarete: "Par rareté",
  demographie: "Par démographie",
  genre: "Par genre",
  personnage: "Par personnage",
  epoque: "Par époque",
  special: "Spéciaux",
};
const title = (f: BoosterFamily) => TITLES[f];

describe("normalizeSearch", () => {
  it("retire accents et macrons, ignore la casse", () => {
    expect(normalizeSearch("  Shōnen ")).toBe("shonen");
    expect(normalizeSearch("Bannière Vedette")).toBe("banniere vedette");
    expect(normalizeSearch("Jūbako")).toBe("jubako");
  });
});

describe("familyRows", () => {
  it("met les boosters hors sélection après les sélectionnables", () => {
    const { on, off } = familyRows(ENTRIES, "demographie");
    expect(on.map((x) => x.slug)).toEqual(["shonen", "seinen"]);
    expect(off.map((x) => x.slug)).toEqual(["shojo", "josei"]);
  });
});

describe("searchEntries", () => {
  it("trouve « Shōnen » en tapant « shonen »", () => {
    expect(searchEntries(ENTRIES, "shonen", title).map((x) => x.slug)).toEqual(["shonen"]);
  });

  it("cherche aussi dans l'accroche et le titre de famille, sélectionnables d'abord", () => {
    expect(searchEntries(ENTRIES, "autre monde", title).map((x) => x.slug)).toEqual(["isekai"]);
    expect(searchEntries(ENTRIES, "démographie", title).map((x) => x.slug)).toEqual(["shonen", "seinen", "shojo", "josei"]);
  });

  it("ne renvoie rien pour une recherche vide", () => {
    expect(searchEntries(ENTRIES, "   ", title)).toEqual([]);
  });
});

describe("firstSelectable / positionInFamily", () => {
  it("saute les boosters hors sélection", () => {
    expect(firstSelectable([e("a", "genre", "A", false), e("b", "genre", "B")], "genre")?.slug).toBe("b");
    expect(firstSelectable(ENTRIES, "rarete")).toBeUndefined();
  });

  it("numérote parmi les sélectionnables de la famille", () => {
    expect(positionInFamily(ENTRIES, "seinen")).toEqual({ index: 2, total: 2 });
    expect(positionInFamily(ENTRIES, "shojo")).toBeNull();
    expect(positionInFamily(ENTRIES, "inconnu")).toBeNull();
  });
});

describe("accessibilité de tous les boosters", () => {
  it("chaque booster sélectionnable est atteignable par son onglet, la feuille « Tous » et la recherche", () => {
    const groups = groupByFamily(ENTRIES, BOOSTER_FAMILIES);
    for (const entry of ENTRIES.filter((x) => x.selectable)) {
      expect(familyRows(ENTRIES, entry.family).on).toContain(entry);
      expect(groups.find((g) => g.family === entry.family)?.on).toContain(entry);
      expect(searchEntries(ENTRIES, entry.name, title)).toContain(entry);
    }
  });

  it("la feuille « Tous » couvre chaque booster une seule fois et saute les familles vides", () => {
    const groups = groupByFamily(ENTRIES, BOOSTER_FAMILIES);
    const listed = groups.flatMap((g) => [...g.on, ...g.off]);
    expect(listed).toHaveLength(ENTRIES.length);
    expect(new Set(listed.map((x) => x.slug)).size).toBe(ENTRIES.length);
    expect(groups.map((g) => g.family)).not.toContain("rarete");
  });
});

describe("initialSelection", () => {
  it("prend le booster demandé s'il est sélectionnable", () => {
    expect(initialSelection(ENTRIES, { slug: "seinen" })).toEqual({ slug: "seinen", family: "demographie" });
  });

  it("ne sélectionne jamais un booster hors sélection", () => {
    expect(initialSelection(ENTRIES, { slug: "shojo" })).toEqual({ slug: "standard", family: "standard" });
    expect(initialSelection(ENTRIES, { slug: "shojo", family: "demographie" })).toEqual({ slug: "shonen", family: "demographie" });
  });

  it("retombe sur la famille demandée, puis sur « standard », puis sur le premier", () => {
    expect(initialSelection(ENTRIES, { family: "genre" })).toEqual({ slug: "isekai", family: "genre" });
    expect(initialSelection(ENTRIES, {})).toEqual({ slug: "standard", family: "standard" });
    expect(initialSelection([e("x", "genre", "X", false), e("y", "epoque", "Y")], {})).toEqual({ slug: "y", family: "epoque" });
    expect(initialSelection([], {})).toBeNull();
  });
});
