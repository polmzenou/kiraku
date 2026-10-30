import type { BoosterShape, BoosterTheme } from "@/lib/boosters/types";
import type { Rarity } from "@/lib/catalog/rarity";
import type { NewsConfig, NewsItem } from "./news-schema";

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

/** Étiquette au-dessus du titre d'une bannière (traduite, clés news.tags.*). */
export const NEWS_TAGS = ["NEW", "NEW_CARDS", "NEW_BOOSTER", "EVENT", "UPDATE", "SOON"] as const;
export type NewsTag = (typeof NEWS_TAGS)[number];

export const NEWS_MAX_ITEMS = 6;
/** Cartes en éventail sur une bannière. */
export const NEWS_MAX_CARDS = 5;
/** Cartes vedettes d'une bannière de booster, en éventail derrière le sachet. */
export const NEWS_BOOSTER_CARDS = 3;

/** Cookie de préférence : la révision que le joueur a réduite (voir lib/consent/registry.ts). */
export const NEWS_COOKIE = "kiraku-news";

/** Image de bannière téléversée par l'admin : https, sur l'hôte du stockage, sous /news/ (rien d'autre). */
export function validNewsImageUrl(raw: string, blobHost: string | undefined): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && !u.username && !u.password && !u.port && Boolean(blobHost) && u.hostname === blobHost && u.pathname.startsWith("/news/");
  } catch {
    return false;
  }
}

// Visuels résolus par le serveur (server/home/news.ts) : les mêmes champs que Fuda et BoosterArt
export type NewsCardView = {
  id: string;
  name: string;
  nameNative: string | null;
  imageUrl: string;
  rank: number | null;
  rarity: Rarity;
  power: number;
  ki: number;
  appearance: unknown;
  formName: string | null;
};
export type NewsBoosterView = { slug: string; name: string; emblem: string; shape: BoosterShape; theme: BoosterTheme; endsAt: string | null };
export type NewsVisualView =
  | { kind: "none" }
  | { kind: "cards"; cards: NewsCardView[] }
  | { kind: "booster"; booster: NewsBoosterView; cards: NewsCardView[] }
  | { kind: "image"; url: string; focalX: number; focalY: number };
export type NewsVisuals = Record<string, NewsVisualView>;

export type NewsLinkView = { kind: "none" } | { kind: "internal" | "external"; href: string; label: string };
export type NewsItemView = {
  id: string;
  tone: NewsTone;
  icon: NewsIcon | null;
  tag: NewsTag | null;
  title: string;
  body: string;
  link: NewsLinkView;
  visual: NewsVisualView;
};
export type NewsView = { revision: number; publishedAt: string | null; title: string; intro: string | null; items: NewsItemView[] };

/** Texte dans la langue du joueur ; l'anglais laissé vide affiche le français. */
const pick = (text: { fr: string; en: string }, locale: string) => (locale === "en" && text.en ? text.en : text.fr);

/**
 * Visuel affiché : celui que le serveur a résolu (cartes, booster), l'image telle quelle, sinon le
 * sceau. Une carte retirée ou un booster éteint fait retomber la bannière sur son sceau.
 */
function visualOf(item: NewsItem, visuals: NewsVisuals): NewsVisualView {
  if (item.visual.kind === "image") return { kind: "image", url: item.visual.url, focalX: item.visual.focalX, focalY: item.visual.focalY };
  return visuals[item.id] ?? { kind: "none" };
}

/** Ce que l'accueil affiche, dans la langue du joueur ; null si l'encart est éteint ou vide. */
export function localizeNews(config: NewsConfig, locale: string, visuals: NewsVisuals = {}): NewsView | null {
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
      tag: item.tag,
      title: pick(item.title, locale),
      body: pick(item.body, locale),
      link: item.link.kind === "none" ? item.link : { kind: item.link.kind, href: item.link.href, label: pick(item.link.label, locale) },
      visual: visualOf(item, visuals),
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
