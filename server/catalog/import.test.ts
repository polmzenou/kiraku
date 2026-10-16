import { describe, expect, it } from "vitest";
import { rawCharacter, rawPage } from "@/lib/catalog/fixtures";
import { SETTING_DEFAULTS } from "@/lib/settings/defaults";
import { finalizeRun, previewRun, runImport, type ImportSettings } from "./import";
import { memoryImportStore } from "./memory-store";

const settings: ImportSettings = {
  perPage: 10,
  requestDelayMs: 2100,
  minTagRank: 60,
  thresholds: SETTING_DEFAULTS["catalog.rarityThresholds"],
  stats: SETTING_DEFAULTS["catalog.stats"],
  policy: "FROZEN",
};

/**
 * Faux AniList : `pages` pages de 10 personnages aux favoris décroissants (id 1 = le plus populaire).
 * Comme le vrai, il honore id_not_in et refuse (400) toute page au-delà de `maxDepth` entrées.
 */
function fakeAniList(pages: number, opts: { failOn?: Map<number, number[]>; maxDepth?: number } = {}) {
  const calls: number[] = [];
  const excludes: number[][] = [];
  const all = Array.from({ length: pages * 10 }, (_, i) => i + 1);
  const fetchFn = (async (_url: string | URL | Request, init?: RequestInit) => {
    const { variables } = JSON.parse(String(init?.body));
    const page: number = variables.page;
    const perPage: number = variables.perPage;
    const exclude: number[] = variables.exclude ?? [];
    calls.push(page);
    excludes.push(exclude);
    const status = opts.failOn?.get(page)?.shift();
    if (status) return new Response("{}", { status, headers: { "retry-after": "1" } });
    if (opts.maxDepth && page * perPage > opts.maxDepth) {
      return Response.json({ errors: [{ message: "Page depth exceeds maximum allowed" }] }, { status: 400 });
    }
    const remaining = all.filter((id) => !exclude.includes(id));
    const slice = remaining.slice((page - 1) * perPage, page * perPage);
    const characters = slice.map((id) => rawCharacter({ id, favourites: 10_000 - id }));
    return Response.json(rawPage(characters, page * perPage < remaining.length), { headers: { "x-ratelimit-remaining": "20" } });
  }) as typeof fetch;
  return { fetchFn, calls, excludes };
}

const noSleep = async () => {};

describe("import AniList", () => {
  it("récupère l'objectif plus une page de marge, puis finalise", async () => {
    const store = memoryImportStore();
    const { fetchFn, calls } = fakeAniList(10);
    const result = await runImport({ store, settings, target: 30, fetch: fetchFn, sleep: noSleep });
    expect(result.status).toBe("finalized");
    expect(calls).toEqual([1, 2, 3, 4]);
    expect(store.cards.size).toBe(30);
    // 3 % de 30 cartes = 0,9 : pas de Mythique, le n° 1 est Légendaire
    expect(store.cards.get(1)).toMatchObject({ rank: 1, rarity: "LEGENDARY" });
  });

  it("s'arrête quand AniList n'a plus de page", async () => {
    const store = memoryImportStore();
    const { fetchFn, calls } = fakeAniList(2);
    const result = await runImport({ store, settings, target: 50, fetch: fetchFn, sleep: noSleep });
    expect(calls).toEqual([1, 2]);
    expect(result.status === "finalized" && result.report.total).toBe(20);
  });

  it("reprend après une interruption sans refaire les pages déjà enregistrées", async () => {
    const store = memoryImportStore();
    const { fetchFn, calls } = fakeAniList(10);
    let pagesDone = 0;
    const first = await runImport({
      store,
      settings,
      target: 40,
      fetch: fetchFn,
      sleep: async () => void pagesDone++,
      shouldStop: () => pagesDone >= 2,
    });
    expect(first).toMatchObject({ status: "interrupted", lastPage: 2, kept: 20 });

    const second = await runImport({ store, settings, target: 40, fetch: fetchFn, sleep: noSleep });
    expect(second.status).toBe("finalized");
    expect(calls).toEqual([1, 2, 3, 4, 5]);
    expect(store.savedPages).toEqual([1, 2, 3, 4, 5]);
    expect(store.cards.size).toBe(40);
  });

  it("réessaie sur 429 et 5xx, puis échoue proprement en restant reprenable", async () => {
    const store = memoryImportStore();
    const sleeps: number[] = [];
    const flaky = fakeAniList(10, { failOn: new Map([[2, [429, 503]]]) });
    const ok = await runImport({ store, settings, target: 20, fetch: flaky.fetchFn, sleep: async (ms) => void sleeps.push(ms) });
    expect(ok.status).toBe("finalized");
    expect(flaky.calls).toEqual([1, 2, 2, 2, 3]);
    expect(sleeps).toContain(2000); // Retry-After 1 s + 1 s

    const store2 = memoryImportStore();
    const down = fakeAniList(10, { failOn: new Map([[2, Array(10).fill(503)]]) });
    const failed = await runImport({ store: store2, settings, target: 20, fetch: down.fetchFn, sleep: noSleep });
    expect(failed).toMatchObject({ status: "failed", lastPage: 1 });
    expect([...store2.runs.values()][0].status).toBe("FAILED");

    const healed = fakeAniList(10);
    const resumed = await runImport({ store: store2, settings, target: 20, fetch: healed.fetchFn, sleep: noSleep });
    expect(resumed.status).toBe("finalized");
    expect(healed.calls).toEqual([2, 3]);
  });

  it("--fresh repart de la page 1", async () => {
    const store = memoryImportStore();
    const { fetchFn } = fakeAniList(10);
    let n = 0;
    await runImport({ store, settings, target: 30, fetch: fetchFn, sleep: async () => void n++, shouldStop: () => n >= 1 });
    const again = fakeAniList(10);
    await runImport({ store, settings, target: 30, fresh: true, fetch: again.fetchFn, sleep: noSleep });
    expect(again.calls[0]).toBe(1);
  });

  it("une seconde finalisation ne change rien (idempotence)", async () => {
    const store = memoryImportStore();
    const { fetchFn } = fakeAniList(10);
    await runImport({ store, settings, target: 30, fetch: fetchFn, sleep: noSleep });
    const before = JSON.stringify([...store.cards.entries()]);

    const run = (await store.latestRun())!;
    const { report } = await finalizeRun(store, run, settings);
    expect(report).toMatchObject({ total: 30, inserted: 0, rankChanged: 0, rarityChanged: 0, removed: 0 });
    expect(JSON.stringify([...store.cards.entries()])).toBe(before);
  });

  it("un nouvel import garde les ids, fige les raretés et sort les cartes disparues", async () => {
    const store = memoryImportStore();
    await runImport({ store, settings, target: 30, fetch: fakeAniList(10).fetchFn, sleep: noSleep });
    const idOf1 = store.cards.get(1)!.id;

    const smaller = await runImport({ store, settings, target: 20, fetch: fakeAniList(10).fetchFn, sleep: noSleep });
    expect(smaller.status === "finalized" && smaller.report).toMatchObject({ inserted: 0, removed: 10, rarityChanged: 0 });
    expect(store.cards.get(1)!.id).toBe(idOf1);
    expect(store.cards.get(25)!.rank).toBeNull();
  });
});

describe("deux imports en même temps", () => {
  it("l'import abandonné par un autre ne peut plus écrire ni publier son classement", async () => {
    const store = memoryImportStore();
    let n = 0;
    const first = await runImport({ store, settings, target: 30, fetch: fakeAniList(10).fetchFn, sleep: async () => void n++, shouldStop: () => n >= 1 });
    expect(first.status).toBe("interrupted");
    const staleRun = (await store.latestRun())!;

    await runImport({ store, settings, target: 30, fresh: true, fetch: fakeAniList(10).fetchFn, sleep: noSleep });
    await expect(store.savePage(staleRun.id, 2, [])).rejects.toThrow(/abandonné/);
    await expect(finalizeRun(store, staleRun, settings)).rejects.toThrow(/abandonné/);
  });
});

describe("extension protégée du catalogue", () => {
  const protectedSettings = { ...settings, policy: "LIVE" as const, preserveExisting: true };

  it("prépare les ajouts sans publication et conserve ensuite les ids, raretés et statistiques existants", async () => {
    const store = memoryImportStore();
    await runImport({ store, settings, target: 30, fetch: fakeAniList(10).fetchFn, sleep: noSleep });
    const before = JSON.stringify([...store.cards]);
    const existing = new Map([...store.cards].map(([anilistId, card]) => [anilistId, { ...card }]));

    const api = fakeAniList(10);
    const changedMetadata = (async (url, init) => {
      const response = await api.fetchFn(url, init);
      const body = await response.json();
      for (const character of body.data.Page.characters) character.name.full = `Nom actualisé ${character.id}`;
      return Response.json(body);
    }) as typeof fetch;
    const staged = await runImport({ store, settings: protectedSettings, target: 50, stageOnly: true, fetch: changedMetadata, sleep: noSleep });
    expect(staged.status).toBe("staged");
    expect(JSON.stringify([...store.cards])).toBe(before);
    expect(staged.status === "staged" && staged.report).toMatchObject({ inserted: 20, removed: 0, rarityChanged: 0 });
    const run = (await store.latestRun())!;
    expect(run.status).toBe("RUNNING");

    await finalizeRun(store, run, protectedSettings);
    expect(store.cards.size).toBe(50);
    for (const [anilistId, card] of existing) expect(store.cards.get(anilistId)).toEqual(card);
    const published = JSON.stringify([...store.cards]);
    await finalizeRun(store, run, protectedSettings);
    expect(JSON.stringify([...store.cards])).toBe(published);
  });

  it("ne modifie aucune carte si l'objectif est inférieur à la taille actuelle", async () => {
    const store = memoryImportStore();
    await runImport({ store, settings, target: 30, fetch: fakeAniList(10).fetchFn, sleep: noSleep });
    const before = JSON.stringify([...store.cards]);
    const result = await runImport({ store, settings: protectedSettings, target: 20, fetch: fakeAniList(10).fetchFn, sleep: noSleep });
    expect(result.status === "finalized" && result.report).toMatchObject({ total: 30, inserted: 0, removed: 0, rarityChanged: 0 });
    expect(JSON.stringify([...store.cards])).toBe(before);
  });

  it("compare un aperçu mémoire au véritable catalogue de départ", async () => {
    const store = memoryImportStore([{ anilistId: 1, rank: 1, rarity: "EPIC", power: 65, ki: 42 }]);
    const result = await runImport({ store, settings: protectedSettings, target: 20, fetch: fakeAniList(10).fetchFn, sleep: noSleep });
    expect(result.status === "finalized" && result.report).toMatchObject({ total: 20, inserted: 19, rarityChanged: 0, removed: 0 });
    expect(store.cards.has(1)).toBe(false);
    expect(await store.catalogSnapshot()).toContainEqual({ anilistId: 1, rank: 1, rarity: "EPIC", power: 65, ki: 42 });
  });

  it("revérifie les statistiques présentes au moment de la publication", async () => {
    const store = memoryImportStore();
    await runImport({ store, settings, target: 30, fetch: fakeAniList(10).fetchFn, sleep: noSleep });
    await runImport({ store, settings: protectedSettings, target: 40, stageOnly: true, fetch: fakeAniList(10).fetchFn, sleep: noSleep });
    const run = (await store.latestRun())!;
    const { entries } = await previewRun(store, run, protectedSettings);
    store.cards.get(1)!.power = 77;
    await store.finalize(run.id, entries, { preserveExisting: true });
    expect(store.cards.get(1)!.power).toBe(77);
  });

  it("préserve une carte qu'AniList ne renvoie plus et numérote seulement les ajouts", async () => {
    const preserved = { anilistId: 999, rank: 7, rarity: "MYTHIC" as const, power: 98, ki: 83 };
    const store = memoryImportStore([preserved]);
    const result = await runImport({ store, settings: protectedSettings, target: 20, fetch: fakeAniList(10).fetchFn, sleep: noSleep });
    expect(result.status === "finalized" && result.report).toMatchObject({ total: 20, inserted: 19, removed: 0, rarityChanged: 0 });
    expect(store.cards.get(1)).toMatchObject({ rank: 8, rarity: "LEGENDARY", power: 97, ki: 73 });
    expect(store.cards.get(19)!.rank).toBe(26);
    expect(store.cards.has(20)).toBe(false);
    expect(await store.catalogSnapshot()).toContainEqual(preserved);
  });
});

describe("limite de profondeur d'AniList (5 000 entrées)", () => {
  it("ouvre une nouvelle fenêtre qui exclut les personnages déjà récupérés", async () => {
    const store = memoryImportStore();
    const api = fakeAniList(10, { maxDepth: 30 });
    const result = await runImport({ store, settings, target: 60, maxDepth: 30, fetch: api.fetchFn, sleep: noSleep });

    expect(result.status).toBe("finalized");
    // pages locales : 1, 2, 3 puis 1, 2, 3 dans la 2e fenêtre, puis 1 dans la 3e
    expect(api.calls).toEqual([1, 2, 3, 1, 2, 3, 1]);
    expect(api.excludes.map((e) => e.length)).toEqual([0, 0, 0, 30, 30, 30, 60]);
    expect(result.status === "finalized" && result.report.total).toBe(60);
    expect([...store.cards.values()].map((c) => c.rank).sort((a, b) => a! - b!)).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
    expect(store.cards.get(31)).toMatchObject({ rank: 31 });
  });

  it("reprend au bon endroit dans une fenêtre suivante après une interruption", async () => {
    const store = memoryImportStore();
    let pagesDone = 0;
    const first = fakeAniList(10, { maxDepth: 30 });
    await runImport({ store, settings, target: 50, maxDepth: 30, fetch: first.fetchFn, sleep: async () => void pagesDone++, shouldStop: () => pagesDone >= 4 });
    expect(first.calls).toEqual([1, 2, 3, 1]);

    const second = fakeAniList(10, { maxDepth: 30 });
    const result = await runImport({ store, settings, target: 50, maxDepth: 30, fetch: second.fetchFn, sleep: noSleep });
    expect(second.calls).toEqual([2, 3]);
    expect(second.excludes.every((e) => e.length === 30)).toBe(true);
    expect(result.status === "finalized" && result.report.total).toBe(50);
  });

  it("rapporte le message d'erreur d'AniList sur un 400", async () => {
    const store = memoryImportStore();
    const api = fakeAniList(10, { maxDepth: 30 });
    // Sans fenêtres (profondeur annoncée trop grande), AniList refuse la page 4
    const result = await runImport({ store, settings, target: 60, maxDepth: 1000, fetch: api.fetchFn, sleep: noSleep });
    expect(result).toMatchObject({ status: "failed", lastPage: 3 });
    expect(result.status === "failed" && result.error).toMatch(/HTTP 400 « Page depth exceeds maximum allowed » \(page 4/);
  });
});
