import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SETTING_DEFAULTS, type SettingKey } from "@/lib/settings/defaults";

const m = vi.hoisted(() => ({ queryRaw: vi.fn(), players: vi.fn() }));
vi.mock("server-only", () => ({}));
// Sans cache Next en test : la fonction mise en cache est appelée telle quelle
vi.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn }));
vi.mock("../db", () => ({ prisma: { $queryRaw: m.queryRaw } }));
vi.mock("../settings", () => ({ getSetting: async (k: SettingKey) => SETTING_DEFAULTS[k] }));
vi.mock("./usage", () => ({
  averageDailyPlayers: m.players,
  currentPollSettings: async () => ({
    ablyEnabled: true,
    notificationsPollSeconds: 60,
    realtimeSafetySeconds: 180,
    chatPollSeconds: 15,
    pullFeedRefreshSeconds: 60,
    battlePollSeconds: 5,
    battleSafetySeconds: 30,
    queuePollSeconds: 5,
    lobbyPollSeconds: 5,
    marketPollSeconds: 15,
  }),
}));

import { heaviestTables, measure, measureSupabase, usageAlerts, usageSnapshot } from "./supabase-usage";

// Répond selon la requête : chaque mesure a sa propre requête SQL
function answer(sql: string) {
  if (sql.includes("pg_database_size")) return [{ bytes: 400_000_000n }];
  if (sql.includes("pg_stat_activity")) return [{ open: 12n, max: 60 }];
  if (sql.includes("storage.objects")) return [{ bytes: 0n }];
  if (sql.includes("pg_total_relation_size")) return [{ name: "UserCard", bytes: 120_000_000n }];
  throw new Error(`requête inattendue : ${sql}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  m.players.mockResolvedValue(10);
  m.queryRaw.mockImplementation(async (strings: TemplateStringsArray) => answer(strings.join("?")));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("mesure de la consommation Supabase", () => {
  it("lit taille, connexions, stockage et tables lourdes", async () => {
    const res = await measureSupabase();
    expect(res).toMatchObject({ dbBytes: 400_000_000, connections: { open: 12, max: 60 }, storageBytes: 0, dailyPlayers: 10 });
    expect(await heaviestTables()).toEqual([{ name: "UserCard", bytes: 120_000_000 }]);
  });

  it("une requête qui échoue vaut « indisponible » sans casser les autres", async () => {
    m.queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = strings.join("?");
      if (sql.includes("storage.objects")) throw new Error('relation "storage.objects" does not exist');
      return answer(sql);
    });
    const res = await measureSupabase();
    expect(res.storageBytes).toBeNull();
    expect(res.dbBytes).toBe(400_000_000);
  });

  it("une requête trop lente est abandonnée", async () => {
    vi.useFakeTimers();
    const pending = measure("lente", () => new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(3_100);
    expect(await pending).toBeNull();
  });

  it("base injoignable : aucune alerte, aucune erreur", async () => {
    m.queryRaw.mockRejectedValue(new Error("connexion refusée"));
    m.players.mockRejectedValue(new Error("connexion refusée"));
    const snapshot = await usageSnapshot();
    expect(snapshot.shares.every((s) => s.share === null)).toBe(true);
    expect(await heaviestTables()).toBeNull();
    expect((await usageAlerts())?.worst).toBeNull();
  });

  it("alerte en orange quand la base dépasse 70 % du plan gratuit (500 Mo)", async () => {
    const res = await usageAlerts();
    // 400 Mo sur 500 Mo = 80 %
    expect(res?.worst).toBe("warn");
    expect(res?.alerts.map((a) => a.key)).toContain("database");
  });
});
