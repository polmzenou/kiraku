import { describe, expect, it } from "vitest";
import { DEFAULT_SPOILER_PREFS, groupSpoilerUniverses, isSpoilerBlurred, isSpoilerKey, spoilerImageAttrs, spoilerKeyOf, spoilerPrefsOf, spoilerRevealCss } from "./spoiler";

const JJK = "cmh1jjk0000000000000univ";
const SERIES = "cmh2solo000000000000seri";

describe("réglage par défaut", () => {
  it("floute tout sans compte", () => {
    expect(spoilerPrefsOf(null)).toEqual({ blur: true, shown: [] });
    expect(spoilerPrefsOf(undefined)).toBe(DEFAULT_SPOILER_PREFS);
    expect(isSpoilerBlurred(DEFAULT_SPOILER_PREFS, JJK)).toBe(true);
  });

  it("reprend le réglage du compte en écartant les clés illisibles", () => {
    expect(spoilerPrefsOf({ spoilerBlur: true, spoilerShown: [JJK, "x", "<style>"] })).toEqual({ blur: true, shown: [JJK] });
    expect(spoilerPrefsOf({ spoilerBlur: false, spoilerShown: [] })).toEqual({ blur: false, shown: [] });
  });
});

describe("clé d'univers", () => {
  it("prend l'univers de la série, sinon la série seule", () => {
    expect(spoilerKeyOf({ id: SERIES, universeId: JJK })).toBe(JJK);
    expect(spoilerKeyOf({ id: SERIES, universeId: null })).toBe(SERIES);
  });

  it("n'accepte que des cuid", () => {
    expect(isSpoilerKey(JJK)).toBe(true);
    expect(isSpoilerKey("court")).toBe(false);
    expect(isSpoilerKey(`${JJK}"]{}`)).toBe(false);
    expect(isSpoilerKey("CMH1JJK0000000000000UNIV")).toBe(false);
    expect(isSpoilerKey(42)).toBe(false);
  });
});

describe("isSpoilerBlurred", () => {
  it("remet en clair seulement les univers choisis", () => {
    const prefs = { blur: true, shown: [JJK] };
    expect(isSpoilerBlurred(prefs, JJK)).toBe(false);
    expect(isSpoilerBlurred(prefs, SERIES)).toBe(true);
  });

  it("garde floutée une carte sans clé d'univers", () => {
    expect(isSpoilerBlurred({ blur: true, shown: [JJK] }, null)).toBe(true);
    expect(isSpoilerBlurred({ blur: true, shown: [JJK] }, undefined)).toBe(true);
  });

  it("n'en floute aucune en « Tout afficher »", () => {
    expect(isSpoilerBlurred({ blur: false, shown: [] }, JJK)).toBe(false);
    expect(isSpoilerBlurred({ blur: false, shown: [] }, null)).toBe(false);
  });
});

describe("spoilerRevealCss", () => {
  it("est vide quand rien n'est choisi", () => {
    expect(spoilerRevealCss([])).toBe("");
    expect(spoilerRevealCss(["pas-une-cle"])).toBe("");
  });

  it("règle les variables du flou pour les univers choisis, sans doublon", () => {
    const css = spoilerRevealCss([JJK, SERIES, JJK]);
    expect(css).toBe(
      `:is([data-spoiler-u="${JJK}"],[data-spoiler-u="${SERIES}"]){--kn-spoiler-blur:blur(0);--kn-spoiler-scale:1;--kn-spoiler-cutout:block;--kn-spoiler-pill:none}`,
    );
  });

  it("n'y laisse entrer aucune clé qui pourrait fermer la règle ou la balise", () => {
    const css = spoilerRevealCss([JJK, `${SERIES}"]{}body{display:none`, "</style><script>"]);
    expect(css).not.toContain("body");
    expect(css).not.toContain("<");
    expect(css.match(/data-spoiler-u/g)).toHaveLength(1);
  });

  it("plafonne le nombre d'univers", () => {
    const keys = Array.from({ length: 400 }, (_, i) => `c${String(i).padStart(24, "0")}`);
    expect(spoilerRevealCss(keys).match(/data-spoiler-u/g)).toHaveLength(300);
  });
});

describe("spoilerImageAttrs", () => {
  it("rien pour une carte non spoil", () => {
    expect(spoilerImageAttrs(false, JJK)).toEqual({});
    expect(spoilerImageAttrs(undefined)).toEqual({});
  });

  it("marque l'image spoil avec sa clé d'univers quand elle est lisible", () => {
    expect(spoilerImageAttrs(true, JJK)).toEqual({ "data-spoiler": "", "data-spoiler-u": JJK });
    expect(spoilerImageAttrs(true, null)).toEqual({ "data-spoiler": "" });
    expect(spoilerImageAttrs(true, "x\"]")).toEqual({ "data-spoiler": "" });
  });
});

describe("groupSpoilerUniverses", () => {
  const jjk = (id: string, titleRomaji: string) => ({ series: { id, titleRomaji, titleEnglish: null, universeId: JJK, universe: { name: "Jujutsu Kaisen" } } });
  const solo = { series: { id: SERIES, titleRomaji: "Shingeki no Kyojin", titleEnglish: "Attack on Titan", universeId: null, universe: null } };

  it("regroupe les séries d'un même univers et garde une série sans univers à part", () => {
    const list = groupSpoilerUniverses([jjk("s1", "Jujutsu Kaisen"), jjk("s2", "Jujutsu Kaisen 0"), jjk("s1", "Jujutsu Kaisen"), solo], "fr");
    expect(list).toEqual([
      { key: JJK, name: "Jujutsu Kaisen", cards: 3 },
      { key: SERIES, name: "Shingeki no Kyojin", cards: 1 },
    ]);
  });

  it("nomme une série seule dans la langue du joueur, et trie par nom", () => {
    const list = groupSpoilerUniverses([jjk("s1", "Jujutsu Kaisen"), solo], "en");
    expect(list.map((u) => u.name)).toEqual(["Attack on Titan", "Jujutsu Kaisen"]);
  });

  it("ne renvoie rien sans carte spoil", () => {
    expect(groupSpoilerUniverses([], "fr")).toEqual([]);
  });
});
