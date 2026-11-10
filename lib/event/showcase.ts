import { z } from "@/lib/zod";
import { eventGaugePhase, type EventGaugePhase } from "@/lib/home/event-gauge";
import { layoutCapacity, MAX_SHOWCASE_CARDS, type ShowcaseLayoutId } from "@/lib/showcase/layouts";

// Event vitrines (concours avec votes) : règles pures, sans base ni horloge cachée. Le serveur s'en sert
// pour décider ; les composants pour afficher.

export type ShowcaseEventPhase = EventGaugePhase;

/** Fenêtre `[startsAt, endsAt[` où l'on s'inscrit et vote ; null si les dates ne forment pas une fenêtre. */
export function showcaseEventPhase(startsAt: string, endsAt: string, now: number): ShowcaseEventPhase | null {
  return eventGaugePhase(Date.parse(startsAt), Date.parse(endsAt), now);
}

// --- Photo de la vitrine engagée ---

/** Carte d'une vitrine engagée : id de Card (pas d'exemplaire) et case. */
export type EntryCard = { position: number; cardId: string };

export const entryCardsSchema = z
  .array(z.object({ position: z.number().int().min(1).max(MAX_SHOWCASE_CARDS), cardId: z.string().min(1).max(64) }).strict())
  .max(MAX_SHOWCASE_CARDS);

/** Cartes enregistrées d'une inscription (JSON de la base) ; une valeur illisible n'en donne aucune. */
export function parseEntryCards(value: unknown): EntryCard[] {
  const parsed = entryCardsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export type SnapshotResult = { ok: true; cards: EntryCard[] } | { ok: false; error: "TOO_FEW_CARDS" };

/**
 * Photo d'une vitrine au moment de l'inscription : cases 1 à la capacité de sa disposition, une carte par
 * case, triées. `items` ne contient que les exemplaires encore possédés (le serveur filtre). Refusée sous
 * `minCards` cartes.
 */
export function entrySnapshot(items: readonly EntryCard[], layout: ShowcaseLayoutId, minCards: number): SnapshotResult {
  const capacity = layoutCapacity(layout);
  const byPosition = new Map<number, string>();
  for (const { position, cardId } of items) {
    if (Number.isInteger(position) && position >= 1 && position <= capacity && !byPosition.has(position)) byPosition.set(position, cardId);
  }
  const cards = [...byPosition].map(([position, cardId]) => ({ position, cardId })).sort((a, b) => a.position - b.position);
  if (cards.length < Math.max(1, minCards)) return { ok: false, error: "TOO_FEW_CARDS" };
  return { ok: true, cards };
}

/** Cases d'une vitrine engagée (null = vide), sur la capacité de sa disposition. */
export function entrySlots<T>(cards: readonly EntryCard[], layout: ShowcaseLayoutId, lookup: (cardId: string) => T | undefined): (T | null)[] {
  const slots: (T | null)[] = Array.from({ length: layoutCapacity(layout) }, () => null);
  for (const { position, cardId } of cards) {
    if (position >= 1 && position <= slots.length) slots[position - 1] = lookup(cardId) ?? null;
  }
  return slots;
}

// --- Votes ---

export type VoteError = "CLOSED" | "NOT_FOUND" | "OWN_ENTRY";

/**
 * Le joueur peut-il voter pour cette inscription ? Event allumé et en cours, inscription de l'édition en
 * cours, et jamais sa propre vitrine.
 */
export function voteError(input: {
  enabled: boolean;
  phase: ShowcaseEventPhase | null;
  edition: string;
  entry: { edition: string; userId: string } | null;
  voterId: string;
}): VoteError | null {
  if (!input.enabled || input.phase !== "live") return "CLOSED";
  if (!input.entry || input.entry.edition !== input.edition) return "NOT_FOUND";
  if (input.entry.userId === input.voterId) return "OWN_ENTRY";
  return null;
}

// --- Classement ---

export type RankInput = {
  entryId: string;
  votes: number;
  /** Dernier vote compté (ms) : à égalité, la vitrine qui a atteint ce score la première passe devant. */
  lastVoteAt: number | null;
  /** Inscription (ms) : dernier départage. */
  createdAt: number;
};
export type RankedEntry = RankInput & { rank: number };

/** Classement final : votes décroissants, puis score atteint le plus tôt, puis inscription la plus ancienne. */
export function rankEntries(rows: readonly RankInput[]): RankedEntry[] {
  const lastVote = (r: RankInput) => r.lastVoteAt ?? Number.POSITIVE_INFINITY;
  return [...rows]
    .sort((a, b) => {
      if (a.votes !== b.votes) return b.votes - a.votes;
      if (lastVote(a) !== lastVote(b)) return lastVote(a) < lastVote(b) ? -1 : 1;
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
      return a.entryId < b.entryId ? -1 : a.entryId > b.entryId ? 1 : 0;
    })
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

// --- Galerie ---

/** Graine 32 bits d'un texte (FNV-1a). */
function hash(text: string): number {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ (c.codePointAt(0) ?? 0), 16777619);
  return h >>> 0;
}

/**
 * Ordre mélangé, stable pour une même graine (joueur et édition) : pendant l'event, personne n'est
 * avantagé par sa date d'inscription, et la pagination reste cohérente d'une page à l'autre.
 */
export function seededOrder(ids: readonly string[], seed: string): string[] {
  const out = [...ids].sort();
  let state = hash(seed) || 1;
  // mulberry32
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Page demandée (1 à la dernière) et ses ids. */
export function pageOf<T>(items: readonly T[], requested: number, pageSize: number): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(pages, Math.max(1, Number.isFinite(requested) ? Math.trunc(requested) : 1));
  return { items: items.slice((page - 1) * pageSize, page * pageSize), page, pages };
}
