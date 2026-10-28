import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ queryRaw: vi.fn(), executeRaw: vi.fn() }));
const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));
vi.mock("./db", () => ({ prisma: { $queryRaw: db.queryRaw, $executeRaw: db.executeRaw } }));

import { clientIp, purgeExpiredRateLimits, rateLimit } from "./ratelimit";

const rule = { limit: 2, windowSeconds: 60 };
let n = 0;
// Clé unique par test : le repli en mémoire garde ses compteurs d'un test à l'autre
const key = () => `test:${++n}`;

beforeEach(() => {
  db.queryRaw.mockReset();
  db.executeRaw.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("rateLimit en base", () => {
  it("autorise tant que le compteur reste sous la limite, refuse au-delà", async () => {
    db.queryRaw.mockResolvedValueOnce([{ count: 2 }]).mockResolvedValueOnce([{ count: 3 }]);
    expect(await rateLimit(key(), rule)).toEqual({ success: true });
    expect(await rateLimit(key(), rule)).toEqual({ success: false });
  });

  it("met la règle dans la clé : deux règles sur la même clé ne partagent pas leur compteur", async () => {
    db.queryRaw.mockResolvedValue([{ count: 1 }]);
    await rateLimit("same", { limit: 5, windowSeconds: 60 });
    expect(db.queryRaw.mock.calls[0]).toContain("same|5/60");
  });

  it("se replie en mémoire si la base lève, sans faire échouer l'action", async () => {
    db.queryRaw.mockRejectedValue(new Error("quota dépassé"));
    const k = key();
    expect(await rateLimit(k, rule)).toEqual({ success: true });
    expect(await rateLimit(k, rule)).toEqual({ success: true });
    expect(await rateLimit(k, rule)).toEqual({ success: false });
  });

  it("se replie en mémoire si la base ne répond pas à temps", async () => {
    vi.useFakeTimers();
    db.queryRaw.mockReturnValue(new Promise(() => {}));
    const pending = rateLimit(key(), rule);
    await vi.advanceTimersByTimeAsync(1_600);
    expect(await pending).toEqual({ success: true });
  });

  it("le magasin mémoire ne touche jamais la base", async () => {
    const k = key();
    for (let i = 0; i < 3; i++) await rateLimit(k, rule, { store: "memory" });
    expect(await rateLimit(k, rule, { store: "memory" })).toEqual({ success: false });
    expect(db.queryRaw).not.toHaveBeenCalled();
  });

  it("la fenêtre mémoire se rouvre une fois passée", async () => {
    vi.useFakeTimers();
    const k = key();
    for (let i = 0; i < 3; i++) await rateLimit(k, rule, { store: "memory" });
    vi.advanceTimersByTime(61_000);
    expect(await rateLimit(k, rule, { store: "memory" })).toEqual({ success: true });
  });

  it("purge par lots jusqu'à vider les compteurs expirés", async () => {
    db.executeRaw.mockResolvedValueOnce(5000).mockResolvedValueOnce(12);
    expect(await purgeExpiredRateLimits()).toBe(5012);
    expect(db.executeRaw).toHaveBeenCalledTimes(2);
  });
});

describe("requête du compteur sur PostgreSQL isolé", () => {
  it("incrémente atomiquement, isole les clés et remet à 1 après la fenêtre", async () => {
    const pg = new PGlite({ extensions: { pg_trgm } });
    try {
      const root = resolve("prisma/migrations");
      for (const folder of readdirSync(root).filter((f) => /^\d/.test(f)).sort()) {
        await pg.exec(readFileSync(resolve(root, folder, "migration.sql"), "utf8"));
      }
      // Le template balisé de Prisma devient une requête paramétrée PGlite ($1, $2…)
      const run = async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const text = strings.reduce((sql, part, i) => sql + part + (i < values.length ? `$${i + 1}` : ""), "");
        return (await pg.query(text, values)).rows;
      };
      db.queryRaw.mockImplementation(run);
      db.executeRaw.mockImplementation(async (s: TemplateStringsArray, ...v: unknown[]) => {
        const text = s.reduce((sql, part, i) => sql + part + (i < v.length ? `$${i + 1}` : ""), "");
        return (await pg.query(text, v)).affectedRows ?? 0;
      });

      const results = await Promise.all([1, 2, 3].map(() => rateLimit("pg:a", rule)));
      expect(results.filter((r) => r.success)).toHaveLength(2);
      expect(await rateLimit("pg:b", rule)).toEqual({ success: true });
      expect((await pg.query(`SELECT count FROM "RateLimit" WHERE key = 'pg:a|2/60'`)).rows).toEqual([{ count: 3 }]);

      // Fenêtre passée : le compteur repart de 1
      await pg.exec(`UPDATE "RateLimit" SET "resetAt" = now() - interval '2 hours' WHERE key = 'pg:a|2/60'`);
      expect(await rateLimit("pg:a", rule)).toEqual({ success: true });
      expect((await pg.query(`SELECT count FROM "RateLimit" WHERE key = 'pg:a|2/60'`)).rows).toEqual([{ count: 1 }]);

      // Purge : seules les lignes expirées depuis plus d'une heure partent
      await pg.exec(`UPDATE "RateLimit" SET "resetAt" = now() - interval '2 hours' WHERE key = 'pg:b|2/60'`);
      expect(await purgeExpiredRateLimits()).toBe(1);
      expect((await pg.query(`SELECT key FROM "RateLimit" ORDER BY key`)).rows).toEqual([{ key: "pg:a|2/60" }]);
    } finally {
      await pg.close();
    }
  }, 60_000);
});

describe("clientIp derrière Nginx", () => {
  afterEach(() => {
    request.headers = new Headers();
  });

  it("garde l'adresse ajoutée par le proxy, pas celle envoyée par le client", async () => {
    request.headers = new Headers({ "x-forwarded-for": "1.1.1.1, 9.9.9.9" });
    expect(await clientIp()).toBe("9.9.9.9");
  });

  it("lit une adresse seule, puis X-Real-IP, puis « local »", async () => {
    request.headers = new Headers({ "x-forwarded-for": "203.0.113.7" });
    expect(await clientIp()).toBe("203.0.113.7");
    request.headers = new Headers({ "x-real-ip": "198.51.100.2" });
    expect(await clientIp()).toBe("198.51.100.2");
    request.headers = new Headers();
    expect(await clientIp()).toBe("local");
  });
});
