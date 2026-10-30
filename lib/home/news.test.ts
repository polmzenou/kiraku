import { describe, expect, it } from "vitest";
import { isCollapsed, localizeNews, NEWS_ICON_KEYS, NEWS_ICONS, NEWS_MAX_ITEMS, nextPublication } from "./news";
import { NEWS_DEFAULT, newsSchema, type NewsConfig, type NewsItem } from "./news-schema";
import { SEAL_GLYPHS } from "@/lib/seal-glyphs";

const item = (over: Partial<NewsItem> = {}): NewsItem => ({
  id: "a",
  tone: "kin",
  icon: null,
  title: { fr: "Titre", en: "" },
  body: { fr: "Texte", en: "" },
  link: { kind: "none" },
  ...over,
});
const config = (over: Partial<NewsConfig> = {}): NewsConfig => ({ ...NEWS_DEFAULT, items: [item()], ...over });
const valid = (value: unknown) => newsSchema.safeParse(value).success;

describe("schéma de l'encart Nouveautés", () => {
  it("accepte la valeur par défaut, allumée avec la v2.5", () => {
    expect(valid(NEWS_DEFAULT)).toBe(true);
    expect(NEWS_DEFAULT.enabled).toBe(true);
    expect(NEWS_DEFAULT.items.length).toBeGreaterThan(0);
  });

  it("refuse un encart allumé sans nouveauté, mais accepte de l'éteindre vide", () => {
    expect(valid(config({ items: [] }))).toBe(false);
    expect(valid(config({ enabled: false, items: [] }))).toBe(true);
  });

  it(`borne à ${NEWS_MAX_ITEMS} nouveautés aux identifiants uniques`, () => {
    const many = Array.from({ length: NEWS_MAX_ITEMS + 1 }, (_, i) => item({ id: `n${i}` }));
    expect(valid(config({ items: many }))).toBe(false);
    expect(valid(config({ items: many.slice(0, NEWS_MAX_ITEMS) }))).toBe(true);
    expect(valid(config({ items: [item({ id: "x" }), item({ id: "x" })] }))).toBe(false);
  });

  it("exige le français et accepte l'anglais vide", () => {
    expect(valid(config({ items: [item({ title: { fr: "", en: "Title" } })] }))).toBe(false);
    expect(valid(config({ title: { fr: "Nouveautés", en: "" } }))).toBe(true);
  });

  it("n'accepte que des pages du site et des liens https", () => {
    const withLink = (link: unknown) => valid(config({ items: [item({ link: link as NewsItem["link"] })] }));
    const label = { fr: "Voir", en: "" };
    expect(withLink({ kind: "internal", href: "/parrainage", label })).toBe(true);
    expect(withLink({ kind: "internal", href: "/wiki?q=levi#top", label })).toBe(true);
    expect(withLink({ kind: "external", href: "https://x.com/kirakukuntcg", label })).toBe(true);
    for (const href of ["//evil.test", "/\\evil.test", "parrainage", "javascript:alert(1)", "/a b", 'https://x.com"'])
      expect(withLink({ kind: "internal", href, label })).toBe(false);
    for (const href of ["http://x.com", "javascript:alert(1)", "data:text/html,x", "/parrainage"])
      expect(withLink({ kind: "external", href, label })).toBe(false);
    expect(withLink({ kind: "internal", href: "/parrainage", label: { fr: "", en: "" } })).toBe(false);
  });

  it("refuse les champs inconnus et les sceaux hors liste", () => {
    expect(valid({ ...config(), html: "<b>x</b>" })).toBe(false);
    expect(valid(config({ items: [{ ...item(), extra: 1 } as NewsItem] }))).toBe(false);
    expect(valid(config({ items: [item({ icon: "SKULL" as NewsItem["icon"] })] }))).toBe(false);
  });

  it("ne propose que des sceaux tracés par la police réduite", () => {
    for (const key of NEWS_ICON_KEYS) expect(SEAL_GLYPHS).toContain(NEWS_ICONS[key]);
  });
});

describe("affichage de l'encart", () => {
  it("prend l'anglais quand il est rempli, le français sinon", () => {
    const news = config({
      title: { fr: "Nouveautés", en: "What's new" },
      intro: { fr: "Bonjour", en: "" },
      items: [item({ title: { fr: "Boutique", en: "Shop" }, link: { kind: "internal", href: "/boutique", label: { fr: "Voir", en: "" } } })],
    });
    const en = localizeNews(news, "en")!;
    expect(en.title).toBe("What's new");
    expect(en.intro).toBe("Bonjour");
    expect(en.items[0].title).toBe("Shop");
    expect(en.items[0].link).toEqual({ kind: "internal", href: "/boutique", label: "Voir" });
    expect(localizeNews(news, "fr")!.title).toBe("Nouveautés");
  });

  it("n'affiche rien quand l'encart est éteint, et pas d'intro vide", () => {
    expect(localizeNews(config({ enabled: false }), "fr")).toBeNull();
    expect(localizeNews(config({ intro: { fr: "", en: "" } }), "fr")!.intro).toBeNull();
  });

  it("reste réduit pour la publication réduite, rouvert à la suivante", () => {
    expect(isCollapsed("3", 3)).toBe(true);
    expect(isCollapsed("2", 3)).toBe(false);
    expect(isCollapsed(undefined, 3)).toBe(false);
    expect(isCollapsed("", 0)).toBe(false);
  });

  it("garde la révision du serveur, et ne passe à la suivante que pour rouvrir", () => {
    const stored = config({ revision: 4, publishedAt: "2026-10-30T12:00:00.000Z" });
    const draft = config({ revision: 99, publishedAt: null, title: { fr: "Corrigé", en: "" } });
    const now = new Date("2026-11-02T09:30:00.000Z");
    const fixed = nextPublication(stored, draft, false, now);
    expect(fixed).toMatchObject({ revision: 4, publishedAt: "2026-10-30T12:00:00.000Z", title: { fr: "Corrigé", en: "" } });
    const reopened = nextPublication(stored, draft, true, now);
    expect(reopened).toMatchObject({ revision: 5, publishedAt: "2026-11-02T09:30:00.000Z" });
    expect(valid(reopened)).toBe(true);
  });
});
