import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fr from "@/messages/fr.json";
import en from "@/messages/en.json";
import { localizeNews, NEWS_COOKIE, type NewsCardView, type NewsVisuals } from "@/lib/home/news";
import { NEWS_DEFAULT, type NewsConfig, type NewsItem } from "@/lib/home/news-schema";
import { NewsPanelView } from "./NewsPanelView";

const mocks = vi.hoisted(() => ({ setting: vi.fn(), cookie: vi.fn(), locale: vi.fn(), visuals: vi.fn(), user: vi.fn(), vote: vi.fn(), action: vi.fn() }));
vi.mock("@/server/settings", () => ({ getSetting: mocks.setting }));
vi.mock("@/server/user", () => ({ requireActiveUser: mocks.user }));
vi.mock("@/server/welcome", () => ({ getDiscordVote: mocks.vote }));
vi.mock("@/server/actions/welcome", () => ({ voteDiscordPollAction: mocks.action }));
vi.mock("@/server/home/news", () => ({ resolveNewsVisuals: mocks.visuals }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => mocks.cookie(name) }) }));
vi.mock("next-intl/server", () => ({ getLocale: mocks.locale }));
vi.mock("next/image", async () => {
  const { createElement: h } = await import("react");
  return { default: ({ src, alt, className, style }: Record<string, unknown>) => h("img", { src, alt, className, style }) };
});
// La face des cartes a ses propres tests : ici, seul l'éventail de la bannière compte
vi.mock("@/components/fuda/Fuda", async () => {
  const { createElement: h } = await import("react");
  return { Fuda: ({ card, still }: { card: { name: string }; still?: boolean }) => h("span", { "data-card": card.name, "data-still": still ? "" : undefined }) };
});
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
const view = (config: NewsConfig, locale: "fr" | "en", collapsed = false, visuals: NewsVisuals = {}, poll: { vote: boolean | null } | null = null) =>
  render(locale, createElement(NewsPanelView, { news: localizeNews(config, locale, visuals)!, initialCollapsed: collapsed, poll }));

const card = (id: string): NewsCardView => ({ id, name: `Carte ${id}`, nameNative: null, imageUrl: `https://s4.anilist.co/${id}.png`, rank: 1, rarity: "MYTHIC", power: 90, ki: 80, appearance: {}, formName: null });
const imperial = { slug: "imperial", name: "Impérial", emblem: "皇", shape: "JUBAKO" as const, theme: { base: "#1E3557", dark: "#0B1424", pattern: "kikko" as const, ink: "light" as const }, endsAt: "2026-11-06T22:00:00.000Z" };
const only = (item: Partial<NewsItem>): NewsConfig => ({ ...NEWS_DEFAULT, items: [{ ...NEWS_DEFAULT.items[0], ...item }] });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setting.mockResolvedValue(NEWS_DEFAULT);
  mocks.cookie.mockReturnValue(undefined);
  mocks.locale.mockResolvedValue("fr");
  mocks.visuals.mockResolvedValue({});
  mocks.user.mockResolvedValue(null);
  mocks.vote.mockResolvedValue(null);
});

describe("carrousel Nouveautés de l'accueil", () => {
  it("montre une bannière par nouveauté, avec des points et un bouton pause accessibles", () => {
    const html = view(NEWS_DEFAULT, "fr");
    expect(html).toContain("Kiraku-kun v2.5");
    expect(html).toContain("Mis à jour le 30 octobre");
    expect(html).toContain('aria-roledescription="carrousel"');
    const count = NEWS_DEFAULT.items.length;
    expect(html.match(/aria-roledescription="bannière"/g)).toHaveLength(count);
    expect(html).toContain(`aria-label="1 sur ${count}"`);
    expect(html).toContain('aria-label="Bannière 1 : Le parrainage évolue" aria-current="true"');
    expect(html).toContain('aria-label="Mettre en pause le défilement"');
    for (const item of NEWS_DEFAULT.items) expect(html).toContain(item.title.fr.replace("'", "&#x27;"));
    expect(html).toContain('href="/parrainage"');
    expect(html).toMatch(/<a href="https:\/\/x\.com\/kirakukuntcg" target="_blank" rel="noopener noreferrer"/);
    expect(html).not.toMatch(/id="[^"]+-body" hidden/);
  });

  it("habille chaque bannière : étiquette traduite, grand sceau sans visuel", () => {
    const html = view(only({ tag: "EVENT", icon: "PARTY", visual: { kind: "none" } }), "fr");
    expect(html).toContain(">Événement</p>");
    expect(html).toMatch(/lang="ja" class="grid size-28[^"]*">祝</);
    expect(html).toContain('data-tone="kin"');
    expect(html).toContain("wagara-asanoha");
  });

  it("déploie les cartes en éventail, figées hors de la bannière active", () => {
    const config: NewsConfig = {
      ...NEWS_DEFAULT,
      items: [
        { ...NEWS_DEFAULT.items[0], id: "un", visual: { kind: "cards", cardIds: ["a", "b"] } },
        { ...NEWS_DEFAULT.items[1], id: "deux", visual: { kind: "cards", cardIds: ["c"] } },
      ],
    };
    const html = view(config, "fr", false, { un: { kind: "cards", cards: [card("a"), card("b")] }, deux: { kind: "cards", cards: [card("c")] } });
    expect(html).toContain('data-card="Carte a"');
    expect(html).toContain('data-card="Carte b"');
    expect(html).toMatch(/data-card="Carte c" data-still=""/);
    expect(html).not.toMatch(/data-card="Carte a" data-still/);
  });

  it("montre le sachet d'un booster, ses vedettes et sa date de fin, avec un bouton vers sa vitrine", () => {
    const config = only({ link: { kind: "none" }, visual: { kind: "booster", slug: "imperial" } });
    const html = view(config, "fr", false, { [config.items[0].id]: { kind: "booster", booster: imperial, cards: [card("v1")] } });
    expect(html).toContain("booster-art");
    expect(html).toContain("wagara-kikko");
    expect(html).toContain("--nb-base:#1E3557");
    expect(html).toContain('data-card="Carte v1"');
    expect(html).toContain("Jusqu&#x27;au 6 novembre");
    expect(html).toContain('href="/?b=imperial"');
    expect(html).toContain("Ouvrir le booster");
  });

  it("pose une image téléversée en fond, recadrée, sous son voile", () => {
    const html = view(only({ visual: { kind: "image", url: "https://store.public.blob.vercel-storage.com/news/a.webp", focalX: 20, focalY: 70 } }), "fr");
    expect(html).toMatch(/<img src="https:\/\/store\.public\.blob\.vercel-storage\.com\/news\/a\.webp" alt="" class="-z-20 object-cover" style="object-position:20% 70%"/);
    expect(html).toContain("news-veil");
  });

  it("parle anglais sous /en, avec le français quand l'anglais manque", () => {
    const html = view(only({ body: { fr: "Seulement en français", en: "" } }), "en");
    expect(html).toContain("What&#x27;s new");
    expect(html).toContain("Updated October 30");
    expect(html).toContain("Referrals level up");
    expect(html).toContain("Seulement en français");
    expect(html).toContain('href="/en/parrainage"');
    expect(html).toContain('aria-roledescription="carousel"');
  });

  it("tient sur une ligne une fois réduit, le carrousel caché mais relié au bouton", () => {
    const html = view(NEWS_DEFAULT, "fr", true);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(">Afficher<");
    const controls = html.match(/aria-controls="([^"]+)"/)?.[1];
    expect(html).toContain(`id="${controls}" hidden=""`);
  });

  it("affiche les textes de l'admin comme du texte, jamais comme du HTML", () => {
    const html = view(only({ title: { fr: '<img src=x onerror="alert(1)">', en: "" } }), "fr");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });

  it("ne rend rien éteint, résout les visuels sinon, et reste réduit pour la publication réduite", async () => {
    mocks.setting.mockResolvedValue({ ...NEWS_DEFAULT, enabled: false });
    expect(await NewsPanel()).toBeNull();
    expect(mocks.visuals).not.toHaveBeenCalled();

    mocks.setting.mockResolvedValue(NEWS_DEFAULT);
    mocks.cookie.mockImplementation((name: string) => (name === NEWS_COOKIE ? { value: String(NEWS_DEFAULT.revision) } : undefined));
    expect((await NewsPanel())?.props).toMatchObject({ initialCollapsed: true });
    expect(mocks.visuals).toHaveBeenCalledWith(NEWS_DEFAULT.items, "fr");

    mocks.cookie.mockImplementation((name: string) => (name === NEWS_COOKIE ? { value: String(NEWS_DEFAULT.revision - 1) } : undefined));
    expect((await NewsPanel())?.props).toMatchObject({ initialCollapsed: false });
  });

  it("pose le sondage Discord en première bannière pour un joueur connecté, jamais pour un visiteur", async () => {
    expect((await NewsPanel())?.props).toMatchObject({ poll: null });
    expect(mocks.vote).not.toHaveBeenCalled();

    mocks.user.mockResolvedValue({ id: "player" });
    mocks.vote.mockResolvedValue(true);
    expect((await NewsPanel())?.props).toMatchObject({ poll: { vote: true } });
    expect(mocks.vote).toHaveBeenCalledWith("player");

    const html = view(NEWS_DEFAULT, "fr", false, {}, { vote: null });
    const count = NEWS_DEFAULT.items.length + 1;
    expect(html.match(/aria-roledescription="bannière"/g)).toHaveLength(count);
    expect(html).toMatch(/aria-label="1 sur \d+" data-tone="ai" data-kind="poll"/);
    expect(html).toContain('aria-label="Bannière 1 : Un Discord Kiraku, ça vous intéresse ?" aria-current="true"');
    expect(html).toContain('aria-label="Bannière 2 : Le parrainage évolue"');
    expect(html).toContain(">Sondage</p>");
    expect(html).toMatch(/aria-pressed="false"[^>]*>Oui</);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>(Oui|Non)</);
  });

  it("fige le sondage sur la réponse de qui a déjà voté", () => {
    const html = view(NEWS_DEFAULT, "en", false, {}, { vote: false });
    expect(html).toMatch(/aria-pressed="true" disabled=""[^>]*>No</);
    expect(html).toMatch(/aria-pressed="false" disabled=""[^>]*>Yes</);
    expect(html).toContain("You&#x27;ve already answered this poll, thanks!");
  });
});
