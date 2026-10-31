import "server-only";

type Entry = { players: Set<string>; expiresAt: number };

/** Réactions éphémères, propres à l'instance : aucune écriture en base. */
export class PullLikesStore {
  private entries = new Map<string, Entry>();

  constructor(private readonly maxEntries = 1_000) {}

  private prune(now: number) {
    for (const [id, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(id);
    }
  }

  read(id: string, playerId: string | null, now = Date.now()) {
    this.prune(now);
    const players = this.entries.get(id)?.players;
    return { count: players?.size ?? 0, liked: playerId !== null && (players?.has(playerId) ?? false) };
  }

  set(pull: { id: string; at: string }, playerId: string, liked: boolean, now = Date.now()) {
    this.prune(now);
    let entry = this.entries.get(pull.id);
    if (liked && !entry) {
      // Le fil ne garde jamais de tirage de plus de 30 jours. Borne aussi le nombre d'entrées.
      const expiresAt = new Date(pull.at).getTime() + 31 * 86_400_000;
      if (expiresAt <= now) return { count: 0, liked: false };
      if (this.entries.size >= this.maxEntries) this.entries.delete(this.entries.keys().next().value!);
      entry = { players: new Set(), expiresAt };
      this.entries.set(pull.id, entry);
    }
    if (liked) entry?.players.add(playerId);
    else entry?.players.delete(playerId);
    if (entry?.players.size === 0) this.entries.delete(pull.id);
    return this.read(pull.id, playerId, now);
  }
}

// Partagé entre rendu initial, sondages et actions ; survit au rechargement à chaud en dev.
const shared = globalThis as typeof globalThis & { pullLikes?: PullLikesStore };
export const pullLikes = shared.pullLikes ??= new PullLikesStore();
