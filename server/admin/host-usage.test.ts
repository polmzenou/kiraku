import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SETTING_DEFAULTS, type SettingKey } from "@/lib/settings/defaults";

const GB = 1_073_741_824;
const m = vi.hoisted(() => ({ queryRaw: vi.fn(), loadavg: vi.fn(), readFile: vi.fn(), statfs: vi.fn() }));
vi.mock("server-only", () => ({}));
// Sans cache Next en test : la fonction mise en cache est appelée telle quelle
vi.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn }));
vi.mock("../db", () => ({ prisma: { $queryRaw: m.queryRaw } }));
vi.mock("../settings", () => ({ getSetting: async (k: SettingKey) => SETTING_DEFAULTS[k] }));
vi.mock("node:os", () => ({
  default: {
    loadavg: m.loadavg,
    availableParallelism: () => 4,
    totalmem: () => 4 * GB,
    freemem: () => 0.2 * GB,
    uptime: () => 86_400,
  },
}));
vi.mock("node:fs/promises", () => ({ readFile: m.readFile, statfs: m.statfs }));

import { hostSnapshot, measure, usageAlerts } from "./host-usage";

// Répond selon la requête : chaque mesure a sa propre requête SQL
function answer(sql: string) {
  if (sql.includes("pg_database_size")) return [{ bytes: 150_000_000n }];
  if (sql.includes("pg_stat_activity")) return [{ open: 12n, max: 100 }];
  if (sql.includes("pg_total_relation_size")) return [{ name: "UserCard", bytes: 60_000_000n }];
  throw new Error(`requête inattendue : ${sql}`);
}

const platform = process.platform;
beforeEach(() => {
  vi.clearAllMocks();
  // Mesures Linux, comme sur le VPS, quel que soit le poste qui lance les tests
  Object.defineProperty(process, "platform", { value: "linux" });
  m.loadavg.mockReturnValue([1.2, 1, 0.8]);
  m.readFile.mockResolvedValue("MemTotal: 4194304 kB\nMemFree: 209715 kB\nMemAvailable: 2097152 kB\n");
  m.statfs.mockResolvedValue({ blocks: 20_000_000, bavail: 15_000_000, bsize: 4096 });
  m.queryRaw.mockImplementation(async (strings: TemplateStringsArray) => answer(strings.join("?")));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  Object.defineProperty(process, "platform", { value: platform });
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("consommation du serveur", () => {
  it("lit charge, RAM disponible, disque et base", async () => {
    const res = await hostSnapshot();
    expect(res.measures).toEqual({
      load: { one: 1.2, five: 1, fifteen: 0.8, cores: 4 },
      memory: { totalBytes: 4 * GB, availableBytes: 2 * GB },
      disk: { totalBytes: 20_000_000 * 4096, freeBytes: 15_000_000 * 4096 },
      connections: { open: 12, max: 100 },
    });
    expect(res.database).toMatchObject({ bytes: 150_000_000, tables: [{ name: "UserCard", bytes: 60_000_000 }] });
    expect(res.shares.map((s) => [s.key, s.share])).toEqual([["cpu", 0.25], ["memory", 0.5], ["disk", 0.25], ["connections", 0.12]]);
  });

  it("sans /proc/meminfo, se replie sur la mémoire libre", async () => {
    m.readFile.mockRejectedValue(new Error("ENOENT"));
    expect((await hostSnapshot()).measures.memory?.availableBytes).toBe(0.2 * GB);
  });

  it("une mesure qui échoue vaut « indisponible » sans casser les autres", async () => {
    m.statfs.mockRejectedValue(new Error("EACCES"));
    m.queryRaw.mockRejectedValue(new Error("connexion refusée"));
    const res = await hostSnapshot();
    expect(res.measures.disk).toBeNull();
    expect(res.database).toEqual({ bytes: null, connections: null, tables: null });
    expect(res.measures.load?.five).toBe(1);
  });

  it("une mesure trop lente est abandonnée", async () => {
    vi.useFakeTimers();
    const pending = measure("lente", () => new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(3_100);
    expect(await pending).toBeNull();
  });

  it("alerte en rouge quand la charge sur 5 min dépasse 90 % des cœurs", async () => {
    m.loadavg.mockReturnValue([6, 3.8, 2]);
    const res = await usageAlerts();
    expect(res?.worst).toBe("critical");
    expect(res?.alerts.map((a) => a.key)).toEqual(["cpu"]);
  });

  it("serveur au calme : aucune alerte", async () => {
    expect((await usageAlerts())?.worst).toBeNull();
  });
});
