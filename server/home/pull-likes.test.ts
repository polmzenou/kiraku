import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { PullLikesStore } from "./pull-likes";

const now = Date.parse("2026-10-31T12:00:00Z");
const pull = { id: "pull", at: new Date(now).toISOString() };

describe("likes éphémères des gros tirages", () => {
  it("compte chaque joueur une seule fois et partage le compteur", () => {
    const store = new PullLikesStore();
    expect(store.set(pull, "alice", true, now)).toEqual({ count: 1, liked: true });
    expect(store.set(pull, "alice", true, now)).toEqual({ count: 1, liked: true });
    expect(store.set(pull, "bob", true, now)).toEqual({ count: 2, liked: true });
    expect(store.read(pull.id, "alice", now)).toEqual({ count: 2, liked: true });
    expect(store.read(pull.id, null, now)).toEqual({ count: 2, liked: false });
  });

  it("retire uniquement le like du joueur, sans compteur négatif", () => {
    const store = new PullLikesStore();
    store.set(pull, "alice", true, now);
    store.set(pull, "bob", true, now);
    expect(store.set(pull, "alice", false, now)).toEqual({ count: 1, liked: false });
    expect(store.set(pull, "alice", false, now)).toEqual({ count: 1, liked: false });
    expect(store.set(pull, "bob", false, now)).toEqual({ count: 0, liked: false });
    expect(store.set(pull, "bob", false, now)).toEqual({ count: 0, liked: false });
  });

  it("sépare deux trouvailles de la même carte et ne persiste rien après redémarrage", () => {
    const store = new PullLikesStore();
    store.set(pull, "alice", true, now);
    expect(store.read("another-pull", "alice", now)).toEqual({ count: 0, liked: false });
    expect(new PullLikesStore().read(pull.id, "alice", now)).toEqual({ count: 0, liked: false });
  });

  it("expire les réactions et ne recrée pas de tirage expiré", () => {
    const store = new PullLikesStore();
    store.set(pull, "alice", true, now);
    const later = now + 31 * 86_400_000;
    expect(store.read(pull.id, "alice", later)).toEqual({ count: 0, liked: false });
    expect(store.set(pull, "alice", true, later)).toEqual({ count: 0, liked: false });
  });

  it("borne la mémoire en supprimant les entrées les plus anciennes", () => {
    const store = new PullLikesStore(2);
    store.set(pull, "alice", true, now);
    store.set({ ...pull, id: "second" }, "alice", true, now);
    store.set({ ...pull, id: "third" }, "alice", true, now);
    expect(store.read(pull.id, "alice", now)).toEqual({ count: 0, liked: false });
    expect(store.read("second", "alice", now)).toEqual({ count: 1, liked: true });
    expect(store.read("third", "alice", now)).toEqual({ count: 1, liked: true });
  });
});
