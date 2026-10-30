import "server-only";
import { unstable_cache } from "next/cache";
import { localize, parseLocalized, parseTheme } from "@/lib/boosters/types";
import { NEWS_BOOSTER_CARDS, type NewsBoosterView, type NewsCardView, type NewsVisuals } from "@/lib/home/news";
import type { NewsVisual } from "@/lib/home/news-schema";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "../db";
import { BOOSTER_TYPES_TAG } from "../boosters/pools";
import { CATALOG_TAG } from "../catalog/queries";

// Visuels des bannières Nouveautés : cartes publiées (éventail) et boosters actifs (sachet, vedettes).
// Une carte retirée ou un booster éteint est ignoré : la bannière retombe sur son sceau.

const CARD_FIELDS = { id: true, name: true, nameNative: true, imageUrl: true, rank: true, rarity: true, power: true, ki: true, appearance: true, formName: true } as const;

type Loaded = { cards: NewsCardView[]; boosters: (NewsBoosterView & { featured: string[] })[] };

/**
 * Lecture en base, testable avec un faux client : deux requêtes (boosters, puis toutes les cartes). Un
 * booster éteint ou déjà terminé n'est pas montré : sa bannière garderait un bouton vers un booster fermé.
 */
export async function readNewsVisuals(
  db: Pick<PrismaClient, "card" | "boosterType">,
  cardIds: readonly string[],
  slugs: readonly string[],
  locale: string,
  now: Date,
): Promise<Loaded> {
  const types = slugs.length
    ? await db.boosterType.findMany({
        where: { slug: { in: [...slugs] }, active: true, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        select: { slug: true, name: true, emblem: true, shape: true, theme: true, endsAt: true, featuredCardIds: true },
      })
    : [];
  const boosters = types.map((t) => ({
    slug: t.slug,
    name: localize(parseLocalized(t.name, t.slug), locale),
    emblem: t.emblem,
    shape: t.shape,
    theme: parseTheme(t.theme),
    endsAt: t.endsAt?.toISOString() ?? null,
    featured: t.featuredCardIds.slice(0, NEWS_BOOSTER_CARDS),
  }));
  const wanted = [...new Set([...cardIds, ...boosters.flatMap((b) => b.featured)])];
  const cards = wanted.length ? await db.card.findMany({ where: { id: { in: wanted }, status: "PUBLISHED" }, select: CARD_FIELDS }) : [];
  return { cards, boosters };
}

// Partagé par tous les joueurs (les arguments font partie de la clé) ; vidé quand le catalogue ou les
// boosters changent, et au plus tard après 10 minutes (fin d'un booster)
const loadNewsVisuals = unstable_cache((cardIds: string[], slugs: string[], locale: string) => readNewsVisuals(prisma, cardIds, slugs, locale, new Date()), ["home-news-visuals-v1"], {
  tags: [CATALOG_TAG, BOOSTER_TYPES_TAG],
  revalidate: 600,
});

/** Visuel résolu de chaque nouveauté qui en a un, dans l'ordre choisi par l'admin. */
export function assembleNewsVisuals(items: readonly { id: string; visual: NewsVisual }[], loaded: Loaded): NewsVisuals {
  const cards = new Map(loaded.cards.map((c) => [c.id, c]));
  const boosters = new Map(loaded.boosters.map((b) => [b.slug, b]));
  const pick = (ids: readonly string[]) => ids.flatMap((id) => cards.get(id) ?? []);
  const out: NewsVisuals = {};
  for (const { id, visual } of items) {
    if (visual.kind === "cards") {
      const chosen = pick(visual.cardIds);
      if (chosen.length > 0) out[id] = { kind: "cards", cards: chosen };
    } else if (visual.kind === "booster") {
      const booster = boosters.get(visual.slug);
      if (booster) {
        const { featured, ...view } = booster;
        out[id] = { kind: "booster", booster: view, cards: pick(featured) };
      }
    }
  }
  return out;
}

/** Visuels des nouveautés (accueil et aperçu de l'admin). */
export async function resolveNewsVisuals(items: readonly { id: string; visual: NewsVisual }[], locale: string): Promise<NewsVisuals> {
  const cardIds = [...new Set(items.flatMap((i) => (i.visual.kind === "cards" ? i.visual.cardIds : [])))].sort();
  const slugs = [...new Set(items.flatMap((i) => (i.visual.kind === "booster" ? [i.visual.slug] : [])))].sort();
  if (cardIds.length === 0 && slugs.length === 0) return {};
  return assembleNewsVisuals(items, await loadNewsVisuals(cardIds, slugs, locale));
}
