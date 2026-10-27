import "server-only";
import { getTranslations } from "next-intl/server";
import { unstable_cache } from "next/cache";
import type { CardView } from "@/lib/boosters/view";
import { type Rarity } from "@/lib/catalog/rarity";
import { displayNameFor } from "@/lib/collection/display-name";
import { decorFromRelations, type PlayerDecor } from "@/lib/profile/decor";
import { prisma } from "../db";
import { cardViews } from "../boosters/display";
import { namedPlayerSelect } from "../collection/public-names";
import { getRarities } from "../catalog/rarities";
import { decorSelect } from "../profile/decor";
import { getSetting } from "../settings";

export type RecentPull = {
  id: string;
  card: CardView;
  /** Pseudo affiché ; `profile` n'est rempli que si le profil est public (lien et avatar). */
  name: string;
  profile: { username: string; image: string | null; decor: PlayerDecor } | null;
  at: string;
};

type FeedRow = { id: string; card: CardView; user: Parameters<typeof displayNameFor>[0] & { username: string; image: string | null } & Parameters<typeof decorFromRelations>[0]; at: string };

async function loadFeed(rarities: Rarity[], size: number, since: number, locale: string): Promise<FeedRow[]> {
  const rows = await prisma.notablePull.findMany({
    where: {
      rarity: { in: rarities },
      createdAt: { gt: new Date(since) },
      user: { isGuest: false, OR: [{ pullFeedHiddenUntil: null }, { pullFeedHiddenUntil: { lte: new Date() } }] },
    },
    orderBy: { createdAt: "desc" },
    take: size,
    select: {
      id: true,
      cardId: true,
      createdAt: true,
      user: { select: { ...namedPlayerSelect, image: true, ...decorSelect } },
    },
  });
  const views = await cardViews(rows.map((r) => r.cardId), locale);
  return rows.flatMap((r) => {
    const card = views.get(r.cardId);
    return card ? [{ id: r.id, card, user: r.user, at: new Date(r.createdAt).toISOString() }] : [];
  });
}

// Une fonction en cache par durée (home.pullFeed.cacheSeconds) : la durée d'unstable_cache est fixée à sa création
const feeds = new Map<number, typeof loadFeed>();
function cachedFeed(seconds: number) {
  let feed = feeds.get(seconds);
  if (!feed) {
    feed = unstable_cache(loadFeed, ["home-pull-feed-v3", String(seconds)], { revalidate: seconds, tags: ["home-pull-feed"] });
    feeds.set(seconds, feed);
  }
  return feed;
}

/**
 * Carrousel « En direct · Gros tirages », en commun pour tous les visiteurs : tirages et cartes
 * lus une fois par `home.pullFeed.cacheSeconds`, quel que soit le nombre de joueurs. Les invités n'y
 * figurent pas ; leurs tirages apparaissent s'ils lient ensuite un compte. Un joueur masqué par la
 * modération (`pullFeedHiddenUntil`) en est absent jusqu'à la date posée. Les pseudos suivent la vue
 * publique : un profil privé, réservé aux amis, banni ou anonymisé s'affiche « Un joueur », sans lien ni avatar.
 */
export async function getRecentPulls(locale: string): Promise<RecentPull[] | null> {
  const [enabled, minRarity, size, maxAgeHours, cacheSeconds] = await Promise.all([
    getSetting("home.pullFeed.enabled"),
    getSetting("home.pullFeed.minRarity"),
    getSetting("home.pullFeed.size"),
    getSetting("home.pullFeed.maxAgeHours"),
    getSetting("home.pullFeed.cacheSeconds"),
  ]);
  if (!enabled) return null;
  const RARITIES = await getRarities();
  const rarities = RARITIES.slice(RARITIES.indexOf(minRarity));
  // Fenêtre arrondie à la minute : la clé de cache reste stable entre deux requêtes
  const since = Math.floor((Date.now() - maxAgeHours * 3_600_000) / 60_000) * 60_000;
  const [rows, t] = await Promise.all([cachedFeed(cacheSeconds)(rarities, size, since, locale), getTranslations("playerName")]);
  const labels = { hidden: t("hidden"), deleted: t("deleted") };

  return rows.map((r) => {
    const name = displayNameFor(r.user, null, { friends: false, blocked: false }, labels);
    const visible = name === r.user.username;
    return {
      id: r.id,
      card: r.card,
      name,
      profile: visible ? { username: r.user.username, image: r.user.image, decor: decorFromRelations(r.user) } : null,
      at: r.at,
    };
  });
}

/** Ménage paresseux : les gros tirages trop vieux pour le carrousel ne servent plus à rien. */
export async function purgeOldPulls(now = new Date()) {
  const maxAgeHours = await getSetting("home.pullFeed.maxAgeHours");
  await prisma.notablePull.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - (maxAgeHours + 24) * 3_600_000) } } });
}
