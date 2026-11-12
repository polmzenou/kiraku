import { dayKey, filterContext } from "@/lib/boosters/pool-filter";

// Sorties de nouvelles cartes (/wiki/nouveautes et badge « Nouveau »). Une sortie, ce sont les créations de
// l'admin publiées le même jour dans le fuseau du jeu ; les imports AniList n'en font jamais partie. Seule la
// dernière sortie porte le badge, pendant catalog.newCardHours après sa dernière publication.

/** Carte publiée depuis l'admin : `publishedAt` en ISO (les caches de Next sérialisent en JSON). */
export type ReleasedCard = { id: string; publicId: number; publishedAt: string };

export type CardRelease = {
  /** Jour de la sortie dans le fuseau du jeu (« 2026-11-12 »). */
  day: string;
  /** Dernière publication de la sortie : le badge part de là. */
  lastPublishedAt: string;
  /** Dans l'ordre de publication. */
  cards: ReleasedCard[];
};

export type NewCardsBadge = { publicIds: number[]; until: string };

/**
 * Date de première publication à enregistrer : celle déjà connue ne change jamais (ni à l'archivage ni à
 * une nouvelle publication), sinon l'instant présent quand la carte devient publiée.
 */
export function firstPublishedAt(before: Date | null | undefined, status: string, now: Date): Date | null {
  if (before) return before;
  return status === "PUBLISHED" ? now : null;
}

/** Sorties, de la plus récente à la plus ancienne (au plus `max`). */
export function groupReleases(cards: readonly ReleasedCard[], timeZone: string, max: number): CardRelease[] {
  const byDay = new Map<string, ReleasedCard[]>();
  const sorted = [...cards].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.publicId - b.publicId);
  for (const card of sorted) {
    const day = dayKey(filterContext(new Date(card.publishedAt), timeZone));
    const list = byDay.get(day);
    if (list) list.push(card);
    else byDay.set(day, [card]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, Math.max(0, max))
    .map(([day, list]) => ({ day, lastPublishedAt: list.at(-1)!.publishedAt, cards: list }));
}

/** Badge « Nouveau » : les cartes de la dernière sortie, tant qu'elle a moins de `hours` heures. */
export function newCardsBadge(latest: CardRelease | undefined, now: Date, hours: number): NewCardsBadge | null {
  if (!latest || hours <= 0) return null;
  const until = new Date(new Date(latest.lastPublishedAt).getTime() + hours * 3_600_000);
  if (until <= now) return null;
  return { publicIds: latest.cards.map((c) => c.publicId), until: until.toISOString() };
}

export type BoosterPoolIds = { slug: string; ids: ReadonlySet<string> };

/**
 * Où tirer chaque carte : les boosters dont le pool la contient, et pour chaque booster le nombre de ces
 * cartes qu'il contient. Celui qui en contient le plus d'abord (ordre reçu à égalité), pour la liste comme
 * pour chaque carte ; les boosters qui n'en contiennent aucune sont écartés.
 */
export function boostersForCards(pools: readonly BoosterPoolIds[], cardIds: readonly string[]) {
  const boosters = pools
    .map((pool) => ({ slug: pool.slug, count: cardIds.filter((id) => pool.ids.has(id)).length }))
    .filter((b) => b.count > 0)
    .sort((a, b) => b.count - a.count);
  const ids = new Map(pools.map((p) => [p.slug, p.ids]));
  const byCard: Record<string, string[]> = Object.fromEntries(
    cardIds.map((id) => [id, boosters.filter((b) => ids.get(b.slug)!.has(id)).map((b) => b.slug)]),
  );
  return { byCard, boosters };
}

/** Ordre d'affichage d'une sortie : la plus rare d'abord (ordre du registre), puis par nom. */
export function byRarityThenName<T extends { rarity: string; name: string }>(rarities: readonly string[], locale: string) {
  const rank = (key: string) => rarities.indexOf(key);
  return (a: T, b: T) => rank(b.rarity) - rank(a.rarity) || a.name.localeCompare(b.name, locale);
}
