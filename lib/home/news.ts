import type { NewsConfig } from "./news-schema";

// Encart « Nouveautés » de l'accueil (clé home.news, rempli depuis /admin/nouveautes). Ce module reste
// sans Zod : l'encart l'importe côté client, le schéma vit dans news-schema.ts (serveur et admin).

export const NEWS_TONES = ["kin", "shu", "ai", "hisui", "neutral"] as const;
export type NewsTone = (typeof NEWS_TONES)[number];

/** Sceaux proposés pour une nouveauté : tous figurent dans lib/seal-glyphs.ts (police réduite). */
export const NEWS_ICONS = {
  NEW: "新",
  PARTY: "祝",
  BATTLE: "闘",
  SHOP: "店",
  CARDS: "札",
  GIFT: "贈",
  NEWS: "報",
  ZENI: "銭",
  EVENT: "催",
  SEASON: "星",
  REFERRAL: "招",
  FRIENDS: "友",
} as const;
export type NewsIcon = keyof typeof NEWS_ICONS;
export const NEWS_ICON_KEYS = Object.keys(NEWS_ICONS) as [NewsIcon, ...NewsIcon[]];

export const NEWS_MAX_ITEMS = 6;

/** Cookie de préférence : la révision que le joueur a réduite (voir lib/consent/registry.ts). */
export const NEWS_COOKIE = "kiraku-news";

export type NewsLinkView = { kind: "none" } | { kind: "internal" | "external"; href: string; label: string };
export type NewsItemView = { id: string; tone: NewsTone; icon: NewsIcon | null; title: string; body: string; link: NewsLinkView };
export type NewsView = { revision: number; publishedAt: string | null; title: string; intro: string | null; items: NewsItemView[] };

/** Texte dans la langue du joueur ; l'anglais laissé vide affiche le français. */
const pick = (text: { fr: string; en: string }, locale: string) => (locale === "en" && text.en ? text.en : text.fr);

/** Ce que l'accueil affiche, dans la langue du joueur ; null si l'encart est éteint ou vide. */
export function localizeNews(config: NewsConfig, locale: string): NewsView | null {
  if (!config.enabled || config.items.length === 0) return null;
  const intro = pick(config.intro, locale);
  return {
    revision: config.revision,
    publishedAt: config.publishedAt,
    title: pick(config.title, locale),
    intro: intro || null,
    items: config.items.map((item) => ({
      id: item.id,
      tone: item.tone,
      icon: item.icon,
      title: pick(item.title, locale),
      body: pick(item.body, locale),
      link: item.link.kind === "none" ? item.link : { kind: item.link.kind, href: item.link.href, label: pick(item.link.label, locale) },
    })),
  };
}

/** Le joueur a réduit cette publication-ci : une nouvelle révision rouvre l'encart. */
export function isCollapsed(cookie: string | undefined, revision: number): boolean {
  return cookie !== undefined && cookie === String(revision);
}

/**
 * Valeur enregistrée par l'admin : son contenu, mais la révision et la date de publication viennent du
 * serveur. « Rouvrir » passe à la révision suivante (l'encart se rouvre chez tous ceux qui l'avaient
 * réduit) ; sinon on garde celles en vigueur, pour corriger une faute sans déranger personne.
 */
export function nextPublication(stored: NewsConfig, draft: NewsConfig, reopen: boolean, now: Date): NewsConfig {
  return {
    ...draft,
    revision: reopen ? stored.revision + 1 : stored.revision,
    publishedAt: reopen ? now.toISOString() : stored.publishedAt,
  };
}
