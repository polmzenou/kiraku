import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { MEDIA_RELATIONS_PER_PAGE } from "@/lib/catalog/anilist";
import type { UniversePlan, UniverseSeries } from "@/lib/catalog/universes";
import {
  addSeriesToUniverseWith,
  applyUniversePlan,
  deleteUniverseWith,
  fetchMediaRelations,
  mergeUniversesWith,
  removeSeriesFromUniverseWith,
  renameUniverseWith,
  UniverseError,
} from "./universes-core";

function fake({
  universes = { u1: "Jujutsu Kaisen", u2: "Fate" } as Record<string, string>,
  series = { s1: { universeId: "u1", titleRomaji: "JJK" }, s2: { universeId: "u1", titleRomaji: "JJK 2" } } as Record<string, { universeId: string | null; titleRomaji: string }>,
  moved = 1,
} = {}) {
  const tx = {
    universe: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (universes[where.id] ? { id: where.id, name: universes[where.id] } : null)),
      create: vi.fn(async ({ data }: { data: { name: string } }) => ({ id: `new-${data.name}` })),
      update: vi.fn(async () => ({})),
      delete: vi.fn(async () => ({})),
    },
    series: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => series[where.id] ?? null),
      findFirst: vi.fn(async ({ where }: { where: { id: string; universeId: string } }) => (series[where.id]?.universeId === where.universeId ? series[where.id] : null)),
      findMany: vi.fn(async ({ where }: { where: { universeId: string } }) => Object.keys(series).filter((id) => series[id].universeId === where.universeId).map((id) => ({ id }))),
      count: vi.fn(async ({ where }: { where: { universeId: string } }) => Object.values(series).filter((s) => s.universeId === where.universeId).length),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: moved })),
    },
    adminLog: { create: vi.fn(async () => ({})) },
  };
  const db = { $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)) } as unknown as PrismaClient;
  const logged = () => tx.adminLog.create.mock.calls.map((c) => (c as unknown as [{ data: { action: string; adminId: string } }])[0].data);
  return { tx, db, logged };
}

const code = (promise: Promise<unknown>) => promise.then(() => null, (e: UniverseError) => e.code);

describe("écritures de /admin/univers", () => {
  it("fusionne : verse les séries, supprime la source, journalise", async () => {
    const { tx, db, logged } = fake();
    await mergeUniversesWith(db, "admin", "u1", "u2");
    expect(tx.series.updateMany).toHaveBeenCalledWith({ where: { universeId: "u1" }, data: { universeId: "u2" } });
    expect(tx.universe.delete).toHaveBeenCalledWith({ where: { id: "u1" } });
    expect(logged()).toMatchObject([{ action: "UNIVERSE_MERGE", adminId: "admin" }]);
  });

  it("refuse de fusionner un univers avec lui-même, sans ouvrir de transaction", async () => {
    const { db, tx } = fake();
    expect(await code(mergeUniversesWith(db, "admin", "u1", "u1"))).toBe("SAME");
    expect(tx.universe.delete).not.toHaveBeenCalled();
  });

  it("refuse une fusion vers un univers disparu, sans rien déplacer", async () => {
    const { db, tx } = fake();
    expect(await code(mergeUniversesWith(db, "admin", "u1", "fantome"))).toBe("NOT_FOUND");
    expect(tx.series.updateMany).not.toHaveBeenCalled();
    expect(tx.universe.delete).not.toHaveBeenCalled();
  });

  it("une série retirée reçoit un univers à elle seule : le script ne la replacera pas", async () => {
    const { tx, db, logged } = fake();
    await expect(removeSeriesFromUniverseWith(db, "admin", "u1", "s1")).resolves.toEqual({ id: "new-JJK" });
    expect(tx.universe.create).toHaveBeenCalledWith({ data: { name: "JJK" }, select: { id: true } });
    expect(tx.series.updateMany).toHaveBeenCalledWith({ where: { id: "s1", universeId: "u1" }, data: { universeId: "new-JJK" } });
    expect(logged()).toMatchObject([{ action: "UNIVERSE_REMOVE_SERIES" }]);
  });

  it("une série déjà seule ne se retire pas : ce serait un univers vide de plus", async () => {
    const { db, tx } = fake({ series: { s1: { universeId: "u1", titleRomaji: "JJK" } } });
    expect(await code(removeSeriesFromUniverseWith(db, "admin", "u1", "s1"))).toBe("ALONE");
    expect(tx.universe.create).not.toHaveBeenCalled();
  });

  it("refuse le retrait d'une série qui n'est pas dans cet univers", async () => {
    const { db, tx } = fake();
    expect(await code(removeSeriesFromUniverseWith(db, "admin", "u2", "s1"))).toBe("NOT_FOUND");
    expect(tx.series.updateMany).not.toHaveBeenCalled();
  });

  it("annule le retrait si la série a bougé entre-temps (la transaction échoue)", async () => {
    const { db } = fake({ moved: 0 });
    expect(await code(removeSeriesFromUniverseWith(db, "admin", "u1", "s1"))).toBe("NOT_FOUND");
  });

  it("ajoute une série en gardant son ancien univers dans le journal", async () => {
    const { tx, db, logged } = fake();
    await addSeriesToUniverseWith(db, "admin", "u2", "s1");
    expect(tx.series.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { universeId: "u2" } });
    expect(logged()).toMatchObject([{ action: "UNIVERSE_ADD_SERIES", before: { universeId: "u1" }, after: { universeId: "u2" } }]);
  });

  it("refuse d'ajouter à un univers disparu ou une série disparue", async () => {
    const { db } = fake();
    expect(await code(addSeriesToUniverseWith(db, "admin", "fantome", "s1"))).toBe("NOT_FOUND");
    expect(await code(addSeriesToUniverseWith(db, "admin", "u1", "fantome"))).toBe("NOT_FOUND");
  });

  it("renomme et supprime en journalisant l'état d'avant", async () => {
    const { tx, db, logged } = fake();
    await renameUniverseWith(db, "admin", "u1", "JJK");
    await deleteUniverseWith(db, "admin", "u1");
    expect(tx.universe.delete).toHaveBeenCalledWith({ where: { id: "u1" } });
    expect(logged()).toMatchObject([
      { action: "UNIVERSE_RENAME", before: { name: "Jujutsu Kaisen" }, after: { name: "JJK" } },
      { action: "UNIVERSE_DELETE", before: { name: "Jujutsu Kaisen", seriesIds: ["s1", "s2"] } },
    ]);
  });
});

describe("écriture du plan du script", () => {
  const s = (id: string): UniverseSeries => ({ id, anilistId: 1, titleRomaji: id, universeId: null });

  it("ne déplace jamais une série rangée entre-temps : la condition universeId: null reste dans la requête", async () => {
    const { tx, db } = fake({ moved: 2 });
    const plan: UniversePlan = { create: [{ name: "JJK", series: [s("a"), s("b")] }], join: [{ universeId: "u1", series: [s("c")] }], conflicts: [{ universeIds: ["u1", "u2"], series: [s("d")] }], withoutAnilist: [s("e")] };
    await expect(applyUniversePlan(db, plan)).resolves.toEqual({ created: 1, moved: 4 });
    expect(tx.series.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["a", "b"] }, universeId: null }, data: { universeId: "new-JJK" } });
    expect(tx.series.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["c"] }, universeId: null }, data: { universeId: "u1" } });
    // Conflits et séries sans id AniList : jamais écrits
    expect(JSON.stringify(tx.series.updateMany.mock.calls)).not.toMatch(/"[de]"/);
  });
});

describe("relations AniList", () => {
  const ok = (media: unknown[]) => new Response(JSON.stringify({ data: { Page: { media } } }), { status: 200 });
  const deps = (fetchFn: typeof fetch) => ({ fetch: fetchFn, sleep: vi.fn(async () => {}), requestDelayMs: 1 });
  const variables = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string).variables as { ids: number[] };

  it("découpe par paquets, lit les arêtes et signale les œuvres manquantes", async () => {
    const ids = Array.from({ length: MEDIA_RELATIONS_PER_PAGE + 1 }, (_, i) => i + 1);
    const fetchFn = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const asked = JSON.parse(init!.body as string).variables.ids as number[];
      if (asked.length === 1) return ok([{ id: asked[0], relations: null }]);
      return ok(asked.slice(1).map((id) => ({ id, relations: { edges: [{ relationType: "SEQUEL", node: { id: 900 } }, { relationType: null, node: { id: 901 } }, null] } })));
    });
    const res = await fetchMediaRelations(ids, deps(fetchFn as unknown as typeof fetch));
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(variables(fetchFn.mock.calls[0])).toMatchObject({ ids: ids.slice(0, MEDIA_RELATIONS_PER_PAGE) });
    expect(res.missing).toEqual([1]);
    expect(res.edges).toHaveLength(MEDIA_RELATIONS_PER_PAGE - 1);
    expect(res.edges[0]).toEqual({ from: 2, to: 900, type: "SEQUEL" });
  });

  it("réessaie après un 429 en attendant le délai demandé", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "retry-after": "2" } }))
      .mockResolvedValueOnce(ok([{ id: 7, relations: { edges: [] } }]));
    const d = deps(fetchFn as unknown as typeof fetch);
    await expect(fetchMediaRelations([7], d)).resolves.toEqual({ edges: [], missing: [] });
    expect(d.sleep).toHaveBeenCalledWith(3_000);
  });

  it("lève une erreur sur une réponse inattendue plutôt que de grouper à vide", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ data: {} }), { status: 200 }));
    await expect(fetchMediaRelations([7], deps(fetchFn as unknown as typeof fetch))).rejects.toThrow("Réponse inattendue");
  });

  it("n'appelle pas AniList sans série", async () => {
    const fetchFn = vi.fn();
    await expect(fetchMediaRelations([], deps(fetchFn as unknown as typeof fetch))).resolves.toEqual({ edges: [], missing: [] });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
