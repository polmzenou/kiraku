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
const POOLER = "aws-0-eu-west-1.pooler.supabase.com";
const valid = { DATABASE_URL: `postgresql://postgres.abcref:secret@${POOLER}:6543/postgres`, AUTH_SECRET: "x".repeat(32) };
const session = valid.DATABASE_URL.replace(":6543/", ":5432/");
function check(values: Record<string, string>) {
  return spawnSync(process.execPath, [path.resolve("scripts/check-deploy-env.mjs")], {
    cwd,
    env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, NODE_ENV: "test", ...valid, ...values },
    encoding: "utf8",
  });
}

describe("précontrôle de déploiement", () => {
  it("accepte le bot sans salon de liaison, mais refuse un accueil Discord incomplet", () => {
    expect(check({ DISCORD_BOT_TOKEN: "bot-secret" }).status).toBe(0);
    const result = check({ DISCORD_RULES_CHANNEL_ID: "1565778336947634266" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("DISCORD_PUBLIC_KEY manquante");
    expect(result.stderr).toContain("DISCORD_MEMBER_ROLE_ID manquante");
  });
  it("vérifie le format des identifiants du marché et de la clé publique", () => {
    expect(check({ DISCORD_MARKET_CHANNEL_ID: "wrong", DISCORD_GUILD_ID: "123456789012345678", DISCORD_BOT_TOKEN: "bot" }).stderr).toContain("DISCORD_MARKET_CHANNEL_ID invalide");
    expect(check({ DISCORD_PUBLIC_KEY: "wrong" }).stderr).toContain("DISCORD_PUBLIC_KEY invalide");
  });
  it("refuse de lancer les tests contre l'application même via l'hôte direct", () => {
    const result = check({ DATABASE_URL_TEST: "postgresql://postgres:secret@db.abcref.supabase.co:5432/postgres" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("base isolée");
    expect(result.stderr).not.toContain("secret");
  });
  it("refuse une URL de migration qui vise un autre projet", () => {
    const result = check({ DIRECT_URL: session.replace("postgres.abcref", "postgres.otherref") });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("bases différentes");
  });
  it("accepte le pooler en mode session comme URL de migration du même projet", () => {
    const result = check({ DIRECT_URL: session });
    expect(result.status, result.stderr).toBe(0);
  });
  it("garde la règle Neon : l'hôte direct est l'hôte poolé sans « -pooler »", () => {
    const neon = "postgresql://user:secret@ep-example-pooler.neon.tech/kiraku";
    expect(check({ DATABASE_URL: neon, DIRECT_URL: neon.replace("-pooler", "") }).status).toBe(0);
    expect(check({ DATABASE_URL: neon, DIRECT_URL: neon.replace("ep-example-pooler", "ep-other") }).status).toBe(1);
  });
  it("prévient quand Vercel migrerait par l'hôte direct Supabase (IPv6 seulement)", () => {
    const result = check({ VERCEL: "1", DIRECT_URL: "postgresql://postgres:secret@db.abcref.supabase.co:5432/postgres" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain("IPv6");
  });
  it("refuse une production sans cron ni origine HTTPS", () => {
    const result = check({ VERCEL_ENV: "production", APP_URL: "http://localhost:3000" });
    expect(result.status).toBe(1);
    for (const key of ["APP_URL", "CRON_SECRET"]) expect(result.stderr).toContain(key);
  });
  it("détecte la production hors Vercel, par APP_ENV ou NODE_ENV", () => {
    for (const values of [{ APP_ENV: "production" }, { NODE_ENV: "production" }] as Record<string, string>[]) {
      const result = check(values);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("APP_URL manquante");
    }
    const preview = check({ APP_ENV: "preview", NODE_ENV: "production" });
    expect(preview.status, preview.stderr).toBe(0);
  });
  it("accepte une production VPS complète", () => {
    const result = check({ NODE_ENV: "production", APP_URL: "https://kiraku-kun.com", CRON_SECRET: "c".repeat(32), DIRECT_URL: session });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("production");
  });
  it("accepte une production cohérente sans Redis (limitation en base)", () => {
    const result = check({ VERCEL_ENV: "production", APP_URL: "https://kiraku.example", CRON_SECRET: "c".repeat(32), DIRECT_URL: session });
    expect(result.status, result.stderr).toBe(0);
  });
});
