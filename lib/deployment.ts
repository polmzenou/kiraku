// Environnement de déploiement et origine publique, lus depuis les variables d'environnement.
// Sans dépendance au serveur : testable avec un simple objet de variables.

export type Deployment = "production" | "preview" | "development";
type Vars = Record<string, string | undefined>;

const DEPLOYMENTS: readonly Deployment[] = ["production", "preview", "development"];
const DEV_URL = "http://localhost:3000";

const isDeployment = (value: string | undefined): value is Deployment =>
  DEPLOYMENTS.includes(value as Deployment);

/** APP_ENV d'abord (VPS), puis VERCEL_ENV, puis NODE_ENV : un `next start` vaut production. */
export function deploymentEnv(vars: Vars): Deployment {
  if (isDeployment(vars.APP_ENV)) return vars.APP_ENV;
  if (isDeployment(vars.VERCEL_ENV)) return vars.VERCEL_ENV;
  return vars.NODE_ENV === "production" ? "production" : "development";
}

/**
 * Origine publique du site : APP_URL, sinon les URL fournies par Vercel. Hors production, repli
 * sur le serveur de dev ; en production, `null` (l'appelant refuse de démarrer).
 */
export function resolveAppUrl(vars: Vars, deployment: Deployment = deploymentEnv(vars)): string | null {
  if (vars.APP_URL) return vars.APP_URL.replace(/\/+$/, "");
  // Preview Vercel : URL stable de la branche, pour que les liens visent la même base que la preview
  if (vars.VERCEL_ENV === "preview" && vars.VERCEL_BRANCH_URL) return `https://${vars.VERCEL_BRANCH_URL}`;
  if (vars.VERCEL_PROJECT_PRODUCTION_URL) return `https://${vars.VERCEL_PROJECT_PRODUCTION_URL}`;
  return deployment === "production" ? null : DEV_URL;
}
