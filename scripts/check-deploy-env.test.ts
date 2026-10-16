import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const cwd = mkdtempSync(path.join(os.tmpdir(), "kiraku-env-test-"));
afterAll(() => {
  if (path.dirname(path.resolve(cwd)) !== path.resolve(os.tmpdir()) || !path.basename(cwd).startsWith("kiraku-env-test-")) throw new Error("Répertoire de test inattendu");
  rmSync(cwd, { recursive: true, force: true });
});
const valid = { DATABASE_URL: "postgresql://user:secret@ep-example-pooler.neon.tech/kiraku", AUTH_SECRET: "x".repeat(32) };
function check(values: Record<string, string>) {
  return spawnSync(process.execPath, [path.resolve("scripts/check-deploy-env.mjs")], {
    cwd,
    env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, NODE_ENV: "test", ...valid, ...values },
    encoding: "utf8",
  });
}

describe("précontrôle de déploiement", () => {
  it("refuse de lancer les tests contre l'application même via l'hôte direct", () => {
    const result = check({ DATABASE_URL_TEST: valid.DATABASE_URL.replace("-pooler", "") });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("branche isolée");
    expect(result.stderr).not.toContain("user:secret");
  });
  it("refuse une URL de migration qui vise une autre branche", () => {
    const result = check({ DIRECT_URL: valid.DATABASE_URL.replace("ep-example-pooler", "ep-other") });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("bases différentes");
  });
  it("refuse une production sans Redis, cron ni origine HTTPS", () => {
    const result = check({ VERCEL_ENV: "production", APP_URL: "http://localhost:3000" });
    expect(result.status).toBe(1);
    for (const key of ["APP_URL", "CRON_SECRET", "UPSTASH_REDIS_REST_URL"]) expect(result.stderr).toContain(key);
  });
  it("accepte une production cohérente et les alias Upstash de Vercel", () => {
    const result = check({ VERCEL_ENV: "production", APP_URL: "https://kiraku.example", CRON_SECRET: "c".repeat(32), KV_REST_API_URL: "https://redis.example", KV_REST_API_TOKEN: "token", DIRECT_URL: valid.DATABASE_URL.replace("-pooler", "") });
    expect(result.status, result.stderr).toBe(0);
  });
});
