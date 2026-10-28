import { describe, expect, it } from "vitest";
import { deploymentEnv, resolveAppUrl } from "./deployment";

describe("environnement de déploiement", () => {
  it("lit APP_ENV en priorité, puis VERCEL_ENV, puis NODE_ENV", () => {
    expect(deploymentEnv({ APP_ENV: "preview", NODE_ENV: "production" })).toBe("preview");
    expect(deploymentEnv({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe("preview");
    expect(deploymentEnv({ NODE_ENV: "production" })).toBe("production");
    expect(deploymentEnv({ NODE_ENV: "development" })).toBe("development");
    expect(deploymentEnv({})).toBe("development");
  });

  it("ignore une valeur d'APP_ENV inconnue", () => {
    expect(deploymentEnv({ APP_ENV: "staging", NODE_ENV: "production" })).toBe("production");
  });
});

describe("origine publique", () => {
  it("prend APP_URL sans barre finale", () => {
    expect(resolveAppUrl({ APP_URL: "https://kiraku-kun.com/", NODE_ENV: "production" })).toBe("https://kiraku-kun.com");
  });

  it("garde les URL fournies par Vercel quand APP_URL manque", () => {
    expect(resolveAppUrl({ VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "kiraku-git-x.vercel.app" })).toBe("https://kiraku-git-x.vercel.app");
    expect(resolveAppUrl({ VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "kiraku-kun.vercel.app" })).toBe("https://kiraku-kun.vercel.app");
  });

  it("se replie sur localhost en dev, jamais en production", () => {
    expect(resolveAppUrl({ NODE_ENV: "development" })).toBe("http://localhost:3000");
    expect(resolveAppUrl({ APP_ENV: "preview", NODE_ENV: "production" })).toBe("http://localhost:3000");
    expect(resolveAppUrl({ NODE_ENV: "production" })).toBeNull();
    expect(resolveAppUrl({ APP_ENV: "production" })).toBeNull();
  });
});
