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

/** Tag du fil en cache : invalidé quand l'admin retire ou rend un joueur au carrousel. */
export const PULL_FEED_TAG = "home-pull-feed";

export type FeedQuery = { rarities: Rarity[]; size: number; since: number; maxPerPlayer: number };

/**
 * Ids des gros tirages du carrousel, du plus récent au plus ancien : rareté suffisante, assez récents,
 * ni invité ni joueur retiré (`pullFeedHiddenUntil`), et au plus `maxPerPlayer` par joueur — ses plus
 * récents, si bien qu'un nouveau tirage fait sortir son plus ancien.
 */
export async function feedPullIds({ rarities, size, since, maxPerPlayer }: FeedQuery): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM (
      SELECT np.id, np."createdAt",
        ROW_NUMBER() OVER (PARTITION BY np."userId" ORDER BY np."createdAt" DESC, np.id DESC) AS rn
      FROM "NotablePull" np JOIN "User" u ON u.id = np."userId"
      WHERE np."rarityKey" = ANY(${rarities}) AND np."createdAt" > ${new Date(since)}
        AND u."isGuest" = false AND (u."pullFeedHiddenUntil" IS NULL OR u."pullFeedHiddenUntil" <= now())
    ) ranked
    WHERE rn <= ${maxPerPlayer}
    ORDER BY "createdAt" DESC, id DESC
    LIMIT ${size}`;
  return rows.map((r) => r.id);
}

/**
 * Clé du cache du fil : les réglages, sans la fenêtre de dates, recalculée à chaque relecture. Avec la
 * fenêtre dans la clé, chaque minute créait une entrée (et un fichier dans .next/cache) jamais purgée.
 */
type FeedKey = Omit<FeedQuery, "since"> & { maxAgeHours: number };

async function loadFeed({ maxAgeHours, ...query }: FeedKey, locale: string): Promise<FeedRow[]> {
  const ids = await feedPullIds({ ...query, since: Date.now() - maxAgeHours * 3_600_000 });
  if (ids.length === 0) return [];
  const order = new Map(ids.map((id, i) => [id, i]));
  const found = await prisma.notablePull.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      cardId: true,
      createdAt: true,
      user: { select: { ...namedPlayerSelect, image: true, ...decorSelect } },
    },
  });
  const rows = found.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
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
    feed = unstable_cache(loadFeed, ["home-pull-feed-v5", String(seconds)], { revalidate: seconds, tags: [PULL_FEED_TAG] });
    feeds.set(seconds, feed);
  }
  return feed;
}

/**
 * Carrousel « En direct · Gros tirages », en commun pour tous les visiteurs : tirages et cartes
 * lus une fois par `home.pullFeed.cacheSeconds`, quel que soit le nombre de joueurs. Les invités n'y
 * figurent pas ; leurs tirages apparaissent s'ils lient ensuite un compte. Un joueur masqué par la
 * modération (`pullFeedHiddenUntil`, blacklist de /admin/gros-tirages) en est absent jusqu'à la date posée, et
 * un même joueur n'y apparaît pas plus de `home.pullFeed.maxPerPlayer` fois. Les pseudos suivent la vue
 * publique : un profil privé, réservé aux amis, banni ou anonymisé s'affiche « Un joueur », sans lien ni avatar.
 */
export async function getRecentPulls(locale: string): Promise<RecentPull[] | null> {
  const [enabled, cacheSeconds] = await Promise.all([getSetting("home.pullFeed.enabled"), getSetting("home.pullFeed.cacheSeconds")]);
  if (!enabled) return null;
  const [rows, t] = await Promise.all([cachedFeed(cacheSeconds)(await feedSettings(), locale), getTranslations("playerName")]);
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

/** Réglages du fil (clé du cache public). */
async function feedSettings(): Promise<FeedKey> {
  const [minRarity, size, maxAgeHours, maxPerPlayer, RARITIES] = await Promise.all([
    getSetting("home.pullFeed.minRarity"),
    getSetting("home.pullFeed.size"),
    getSetting("home.pullFeed.maxAgeHours"),
    getSetting("home.pullFeed.maxPerPlayer"),
    getRarities(),
  ]);
  return { rarities: RARITIES.slice(Math.max(0, RARITIES.indexOf(minRarity))), size, maxAgeHours, maxPerPlayer };
}

/** Paramètres du fil d'après les réglages, fenêtre arrondie à la minute (modération de /admin). */
export async function feedQuery(now = Date.now()): Promise<FeedQuery> {
  const { maxAgeHours, ...query } = await feedSettings();
  return { ...query, since: Math.floor((now - maxAgeHours * 3_600_000) / 60_000) * 60_000 };
}

/** Ménage paresseux : les gros tirages trop vieux pour le carrousel ne servent plus à rien. */
export async function purgeOldPulls(now = new Date()) {
  const maxAgeHours = await getSetting("home.pullFeed.maxAgeHours");
  await prisma.notablePull.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - (maxAgeHours + 24) * 3_600_000) } } });
}
