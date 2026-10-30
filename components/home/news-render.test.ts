import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fr from "@/messages/fr.json";
import en from "@/messages/en.json";
import { localizeNews, NEWS_COOKIE } from "@/lib/home/news";
import { NEWS_DEFAULT, type NewsConfig } from "@/lib/home/news-schema";
import { NewsPanelView } from "./NewsPanelView";

const mocks = vi.hoisted(() => ({ setting: vi.fn(), cookie: vi.fn(), locale: vi.fn() }));
vi.mock("@/server/settings", () => ({ getSetting: mocks.setting }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => mocks.cookie(name) }) }));
vi.mock("next-intl/server", () => ({ getLocale: mocks.locale }));
// Lien localisé comme le vrai (français sans préfixe, anglais sous /en), sans le routeur de Next
vi.mock("@/i18n/navigation", async () => {
  const { createElement: h } = await import("react");
  const { useLocale } = await import("next-intl");
  return {
    Link: function Link({ href, ...props }: { href: string } & Record<string, unknown>) {
      const locale = useLocale();
      return h("a", { ...props, href: locale === "en" ? `/en${href}` : href });
    },
  };
});
const { NewsPanel } = await import("./NewsPanel");

const MESSAGES = { fr, en };
const providerProps = (locale: "fr" | "en") => ({
  locale,
  messages: MESSAGES[locale],
  timeZone: "Europe/Paris",
  onError: (e: Error) => {
    throw e;
  },
  children: null,
});
const render = (locale: "fr" | "en", node: ReactElement) => renderToStaticMarkup(createElement(NextIntlClientProvider, providerProps(locale), node));
const view = (config: NewsConfig, locale: "fr" | "en", collapsed = false) =>
  render(locale, createElement(NewsPanelView, { news: localizeNews(config, locale)!, initialCollapsed: collapsed }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setting.mockResolvedValue(NEWS_DEFAULT);
  mocks.cookie.mockReturnValue(undefined);
  mocks.locale.mockResolvedValue("fr");
});

describe("encart Nouveautés de l'accueil", () => {
  it("montre les nouveautés, la date et des boutons sûrs, ouvert", () => {
    const html = view(NEWS_DEFAULT, "fr");
    expect(html).toContain("Kiraku-kun v2.5");
    expect(html).toContain("Mis à jour le 30 octobre");
    for (const item of NEWS_DEFAULT.items) expect(html).toContain(item.title.fr.replace("'", "&#x27;"));
    expect(html).toContain('href="/parrainage"');
    expect(html).toMatch(/<a href="https:\/\/x\.com\/kirakukuntcg" target="_blank" rel="noopener noreferrer"/);
    expect(html).toContain('aria-expanded="true"');
    expect(html).not.toMatch(/id="[^"]+-body" hidden/);
  });

  it("parle anglais sous /en, avec le français quand l'anglais manque", () => {
    const config: NewsConfig = { ...NEWS_DEFAULT, items: [{ ...NEWS_DEFAULT.items[0], body: { fr: "Seulement en français", en: "" } }] };
    const html = view(config, "en");
    expect(html).toContain("What&#x27;s new");
    expect(html).toContain("Updated October 30");
    expect(html).toContain("Referrals level up");
    expect(html).toContain("Seulement en français");
    expect(html).toContain('href="/en/parrainage"');
  });

  it("tient sur une ligne une fois réduit, la liste cachée mais toujours reliée au bouton", () => {
    const html = view(NEWS_DEFAULT, "fr", true);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(">Afficher<");
    const controls = html.match(/aria-controls="([^"]+)"/)?.[1];
    expect(html).toContain(`id="${controls}" hidden=""`);
  });

  it("affiche les textes de l'admin comme du texte, jamais comme du HTML", () => {
    const config: NewsConfig = { ...NEWS_DEFAULT, items: [{ ...NEWS_DEFAULT.items[0], title: { fr: '<img src=x onerror="alert(1)">', en: "" } }] };
    const html = view(config, "fr");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });

  it("ne rend rien éteint, et reste réduit pour la publication réduite par le joueur", async () => {
    mocks.setting.mockResolvedValue({ ...NEWS_DEFAULT, enabled: false });
    expect(await NewsPanel()).toBeNull();

    mocks.setting.mockResolvedValue(NEWS_DEFAULT);
    mocks.cookie.mockImplementation((name: string) => (name === NEWS_COOKIE ? { value: String(NEWS_DEFAULT.revision) } : undefined));
    expect((await NewsPanel())?.props).toMatchObject({ initialCollapsed: true });

    mocks.cookie.mockImplementation((name: string) => (name === NEWS_COOKIE ? { value: String(NEWS_DEFAULT.revision - 1) } : undefined));
    expect((await NewsPanel())?.props).toMatchObject({ initialCollapsed: false });
  });
});
