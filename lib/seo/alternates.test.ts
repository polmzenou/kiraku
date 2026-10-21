import { describe, expect, it } from "vitest";
import { localeAlternates, localePath } from "./alternates";

describe("localePath", () => {
  it("omet le préfixe pour la langue par défaut", () => {
    expect(localePath("", "fr")).toBe("/");
    expect(localePath("/", "fr")).toBe("/");
    expect(localePath("/wiki", "fr")).toBe("/wiki");
  });

  it("préfixe les autres langues", () => {
    expect(localePath("", "en")).toBe("/en");
    expect(localePath("/", "en")).toBe("/en");
    expect(localePath("/wiki/907", "en")).toBe("/en/wiki/907");
  });
});

describe("localeAlternates", () => {
  it("donne la canonique de la langue courante et un x-default français", () => {
    expect(localeAlternates("/wiki", "en")).toEqual({
      canonical: "/en/wiki",
      languages: { fr: "/wiki", en: "/en/wiki", "x-default": "/wiki" },
    });
  });

  it("garde la requête sur chaque variante", () => {
    expect(localeAlternates("/wiki", "fr", "after=48")).toEqual({
      canonical: "/wiki?after=48",
      languages: { fr: "/wiki?after=48", en: "/en/wiki?after=48", "x-default": "/wiki?after=48" },
    });
  });
});
