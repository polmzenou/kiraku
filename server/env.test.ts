import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// env.ts lit process.env au chargement : un module neuf par scénario
const load = () => import("./env");

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "postgresql://user:secret@db.test:6543/postgres");
  vi.stubEnv("AUTH_SECRET", "x".repeat(32));
  for (const key of ["APP_URL", "APP_ENV", "CRON_SECRET", "VERCEL_ENV", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL"]) vi.stubEnv(key, "");
});
afterEach(() => vi.unstubAllEnvs());

describe("origine publique au démarrage", () => {
  it("refuse de démarrer en production sans APP_URL", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "c".repeat(32));
    await expect(load()).rejects.toThrow(/APP_URL est obligatoire en production/);
  });

  it("exige aussi CRON_SECRET en production hors Vercel", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://kiraku-kun.com");
    await expect(load()).rejects.toThrow(/CRON_SECRET/);
  });

  it("utilise APP_URL en production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://kiraku-kun.com/");
    vi.stubEnv("CRON_SECRET", "c".repeat(32));
    const { appUrl, deployment } = await load();
    expect(appUrl()).toBe("https://kiraku-kun.com");
    expect(deployment).toBe("production");
  });

  it("garde le repli sur localhost en dev", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { appUrl, deployment } = await load();
    expect(appUrl()).toBe("http://localhost:3000");
    expect(deployment).toBe("development");
  });
});
