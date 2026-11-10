import "server-only";
import { unstable_cache } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { entrySlots, parseEntryCards, rankEntries, showcaseEventPhase } from "@/lib/event/showcase";
import type { EntryResult, EventPlayer, PodiumEntry, ShowcaseEntryView, ShowcaseEventState } from "@/lib/event/view";
import { decorFromRelations } from "@/lib/profile/decor";
import { effectiveTheme } from "@/lib/showcase/themes";
import { cardViews } from "../boosters/display";
import { prisma } from "../db";
import { decorSelect } from "../profile/decor";
import { getSetting } from "../settings";
import { storedLayout } from "../showcase/core";

// Lectures de l'event vitrines. Une inscription n'apparaît que si son auteur n'est ni banni ni gelé ;
// un vote ne compte que si son auteur n'est pas banni.

/** Tag des résultats en cache : invalidé quand l'admin retire une inscription. */
export const SHOWCASE_EVENT_TAG = "showcase-event";

/** Réglages de l'event et phase à cet instant (l'interrupteur est rendu, pas appliqué). */
export async function getShowcaseEventState(now = Date.now()): Promise<ShowcaseEventState> {
  const [enabled, edition, startsAt, endsAt, minCards, pageSize] = await Promise.all([
    getSetting("event.showcase.enabled"),
    getSetting("event.showcase.edition"),
    getSetting("event.showcase.startsAt"),
    getSetting("event.showcase.endsAt"),
    getSetting("event.showcase.minCards"),
    getSetting("event.showcase.pageSize"),
  ]);
  return { enabled, edition, startsAt, endsAt, phase: showcaseEventPhase(startsAt, endsAt, now), minCards, pageSize };
}

const visibleEntries = (edition: string): Prisma.ShowcaseEventEntryWhereInput => ({
  edition,
  user: { bannedAt: null, deletionRequestedAt: null, anonymizedAt: null },
});

/** Ids des inscriptions visibles de l'édition (ordre d'inscription). */
export async function listEntryIds(edition: string): Promise<string[]> {
  const rows = await prisma.showcaseEventEntry.findMany({ where: visibleEntries(edition), orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } });
  return rows.map((r) => r.id);
}

const playerSelect = { id: true, username: true, image: true, ...decorSelect } as const satisfies Prisma.UserSelect;

function playerOf(user: Prisma.UserGetPayload<{ select: typeof playerSelect }>): EventPlayer {
  return { id: user.id, username: user.username, image: user.image, decor: decorFromRelations(user) };
}

/** Vitrines engagées, dans l'ordre des ids demandés ; les cartes sont relues dans le catalogue (spoil compris). */
export async function getEntries(ids: readonly string[], locale: string): Promise<ShowcaseEntryView[]> {
  if (ids.length === 0) return [];
  const [rows, themes] = await Promise.all([
    prisma.showcaseEventEntry.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, name: true, layout: true, theme: true, cards: true, user: { select: playerSelect } },
    }),
    getSetting("showcase.themes"),
  ]);
  const parsed = rows.map((r) => ({ ...r, layout: storedLayout(r.layout), cards: parseEntryCards(r.cards) }));
  const views = await cardViews(parsed.flatMap((r) => r.cards.map((c) => c.cardId)), locale);
  const byId = new Map(
    parsed.map((r) => [
      r.id,
      {
        id: r.id,
        player: playerOf(r.user),
        name: r.name,
        layout: r.layout,
        theme: effectiveTheme(r.theme, themes),
        cards: entrySlots(r.cards, r.layout, (cardId) => views.get(cardId)).map((card, i) => (card ? { ...card, position: i + 1 } : null)),
      } satisfies ShowcaseEntryView,
    ]),
  );
  return ids.flatMap((id) => byId.get(id) ?? []);
}

/** Inscription du joueur pour l'édition, avec sa photo ; null s'il ne participe pas. */
export async function getMyEntry(edition: string, userId: string, locale: string): Promise<ShowcaseEntryView | null> {
  const row = await prisma.showcaseEventEntry.findUnique({ where: { edition_userId: { edition, userId } }, select: { id: true } });
  if (!row) return null;
  return (await getEntries([row.id], locale))[0] ?? null;
}

/** Inscription pour laquelle le joueur a voté (null s'il n'a pas voté). */
export async function getMyVote(edition: string, voterId: string): Promise<string | null> {
  const vote = await prisma.showcaseEventVote.findUnique({ where: { edition_voterId: { edition, voterId } }, select: { entryId: true } });
  return vote?.entryId ?? null;
}

async function computeResults(edition: string): Promise<EntryResult[]> {
  const [entries, groups] = await Promise.all([
    prisma.showcaseEventEntry.findMany({ where: visibleEntries(edition), select: { id: true, createdAt: true } }),
    prisma.showcaseEventVote.groupBy({
      by: ["entryId"],
      where: { edition, voter: { bannedAt: null } },
      _count: { _all: true },
      _max: { updatedAt: true },
    }),
  ]);
  const tally = new Map(groups.map((g) => [g.entryId, g]));
  return rankEntries(
    entries.map((e) => {
      const g = tally.get(e.id);
      return { entryId: e.id, votes: g?._count._all ?? 0, lastVoteAt: g?._max.updatedAt?.getTime() ?? null, createdAt: e.createdAt.getTime() };
    }),
  ).map(({ entryId, rank, votes }) => ({ entryId, rank, votes }));
}

// Votes figés après la clôture : la fin fait partie de la clé (une fin repoussée recompte)
const loadResults = unstable_cache(
  async (edition: string, endsAt: string) => {
    void endsAt; // Clé de cache seulement.
    return computeResults(edition);
  },
  ["showcase-event-results-v1"],
  { tags: [SHOWCASE_EVENT_TAG], revalidate: 300 },
);

/** Classement final ; seulement une fois l'event terminé (personne ne voit les votes avant). */
export async function getShowcaseEventResults(state: ShowcaseEventState): Promise<EntryResult[] | null> {
  if (state.phase !== "ended") return null;
  return loadResults(state.edition, state.endsAt);
}

/** Podium (trois premiers) avec leurs joueurs ; vide s'il n'y a aucune inscription. */
export async function getShowcaseEventPodium(state: ShowcaseEventState): Promise<PodiumEntry[]> {
  const results = (await getShowcaseEventResults(state))?.slice(0, 3) ?? [];
  if (results.length === 0) return [];
  const rows = await prisma.showcaseEventEntry.findMany({ where: { id: { in: results.map((r) => r.entryId) } }, select: { id: true, user: { select: playerSelect } } });
  const players = new Map(rows.map((r) => [r.id, playerOf(r.user)]));
  return results.flatMap((r) => {
    const player = players.get(r.entryId);
    return player ? [{ ...r, player }] : [];
  });
}

export type AdminEntryRow = {
  id: string;
  username: string;
  hidden: boolean;
  name: string | null;
  cards: number;
  votes: number;
  createdAt: string;
};

/** Inscriptions de l'édition pour l'admin, avec leurs votes en direct (sans cache), les plus votées d'abord. */
export async function getAdminEntries(edition: string): Promise<{ rows: AdminEntryRow[]; votes: number }> {
  const [rows, votes] = await Promise.all([
    prisma.showcaseEventEntry.findMany({
      where: { edition },
      select: {
        id: true,
        name: true,
        cards: true,
        createdAt: true,
        user: { select: { username: true, bannedAt: true, deletionRequestedAt: true, anonymizedAt: true } },
        _count: { select: { votes: true } },
      },
    }),
    prisma.showcaseEventVote.count({ where: { edition } }),
  ]);
  return {
    votes,
    rows: rows
      .map((r) => ({
        id: r.id,
        username: r.user.username,
        hidden: r.user.bannedAt !== null || r.user.deletionRequestedAt !== null || r.user.anonymizedAt !== null,
        name: r.name,
        cards: parseEntryCards(r.cards).length,
        votes: r._count.votes,
        createdAt: r.createdAt.toISOString(),
      }))
      .sort((a, b) => b.votes - a.votes || a.createdAt.localeCompare(b.createdAt)),
  };
}
