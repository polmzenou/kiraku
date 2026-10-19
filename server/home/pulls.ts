import "server-only";
import { getTranslations } from "next-intl/server";
import { unstable_cache } from "next/cache";
import type { CardView } from "@/lib/boosters/view";
import { RARITIES, type Rarity } from "@/lib/catalog/rarity";
import { displayNameFor } from "@/lib/collection/display-name";
import { prisma } from "../db";
import { cardViews } from "../boosters/display";
import { namedPlayerSelect } from "../collection/public-names";
import { getSetting } from "../settings";

export type RecentPull = {
  id: string;
  card: CardView;
  /** Pseudo affiché ; `profile` n'est rempli que si le profil est public (lien et avatar). */
  name: string;
  profile: { username: string; image: string | null } | null;
  at: string;
};

/** Derniers gros tirages, en commun pour tous les visiteurs (10 s de cache). */
const latestPulls = unstable_cache(
  async (rarities: Rarity[], size: number, since: number) =>
    prisma.notablePull.findMany({
      where: { rarity: { in: rarities }, createdAt: { gt: new Date(since) } },
      orderBy: { createdAt: "desc" },
      take: size,
      select: {
        id: true,
        cardId: true,
        createdAt: true,
        user: { select: { ...namedPlayerSelect, image: true } },
      },
    }),
  ["home-pull-feed"],
  { revalidate: 10, tags: ["home-pull-feed"] },
);

/**
 * Carrousel « En direct · Gros tirages ». Les pseudos suivent la vue publique : un profil privé,
 * réservé aux amis, banni ou anonymisé s'affiche « Un joueur », sans lien ni avatar.
 */
export async function getRecentPulls(locale: string): Promise<RecentPull[] | null> {
  const [enabled, minRarity, size, maxAgeHours] = await Promise.all([
    getSetting("home.pullFeed.enabled"),
    getSetting("home.pullFeed.minRarity"),
    getSetting("home.pullFeed.size"),
    getSetting("home.pullFeed.maxAgeHours"),
  ]);
  if (!enabled) return null;
  const rarities = RARITIES.slice(RARITIES.indexOf(minRarity));
  // Fenêtre arrondie à la minute : la clé de cache reste stable entre deux requêtes
  const since = Math.floor((Date.now() - maxAgeHours * 3_600_000) / 60_000) * 60_000;
  const [rows, t] = await Promise.all([latestPulls(rarities, size, since), getTranslations("playerName")]);
  const views = await cardViews(rows.map((r) => r.cardId), locale);
  const labels = { hidden: t("hidden"), deleted: t("deleted") };

  return rows.flatMap((r) => {
    const card = views.get(r.cardId);
    if (!card) return [];
    const name = displayNameFor(r.user, null, { friends: false, blocked: false }, labels);
    const visible = name === r.user.username;
    return [
      {
        id: r.id,
        card,
        name,
        profile: visible ? { username: r.user.username, image: r.user.image } : null,
        at: new Date(r.createdAt).toISOString(),
      },
    ];
  });
}

/** Ménage paresseux : les gros tirages trop vieux pour le carrousel ne servent plus à rien. */
export async function purgeOldPulls(now = new Date()) {
  const maxAgeHours = await getSetting("home.pullFeed.maxAgeHours");
  await prisma.notablePull.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - (maxAgeHours + 24) * 3_600_000) } } });
}
