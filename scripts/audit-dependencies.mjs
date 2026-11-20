import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Exceptions temporaires : alertes élevées sans correctif publié, tolérées seulement là où le motif
// fautif ne vient jamais d'un joueur. Chacune nomme l'alerte, le paquet touché, les seuls paquets
// autorisés à en hériter (tout nouvel héritier bloque) et les seules installations hors
// développement admises. Retirer une exception dès qu'un correctif compatible est publié.
//
// Une alerte qui a un correctif publié se règle plutôt par un override (package.json, « overrides ») :
// - effect ^3.22.5 : @prisma/config (CLI Prisma) fige effect 3.20.0, touché par GHSA-7589-6fvf-x4pw (ReDoS de
//   Schema.TemplateLiteral, corrigé en 3.22.1). Validé avec npm ci, prisma validate et prisma generate. Retirer
//   l'override dès qu'une version de Prisma embarque un effect corrigé.
export const EXCEPTIONS = [
  {
    // Aucun correctif de picomatch au 18/11/2026. picomatch ne compile que des motifs écrits dans le
    // code ou la configuration : lint, Vite et Vitest en développement, et @parcel/watcher, tiré par
    // next-intl/plugin pour l'extraction des messages (désactivée ici), avec les dossiers ignorés
    // fixés par le plugin.
    advisory: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf",
    package: "picomatch",
    dependents: new Set([
      "micromatch", "fast-glob", "@next/eslint-plugin-next", "eslint-config-next",
      "fdir", "tinyglobby", "vite", "vitest", "eslint-import-resolver-typescript",
      "@typescript-eslint/typescript-estree", "@parcel/watcher",
    ]),
    production: new Set(["node_modules/@parcel/watcher", "node_modules/@parcel/watcher/node_modules/picomatch"]),
  },
];
const severities = new Set(["info", "low", "moderate", "high", "critical"]);
const blocking = (severity) => !severities.has(severity) || severity === "high" || severity === "critical";

export function assessAudit(report, lockfile, exceptions = EXCEPTIONS) {
  if (report?.error || report?.auditReportVersion !== 2 || !report.vulnerabilities ||
      typeof report.vulnerabilities !== "object" || Array.isArray(report.vulnerabilities)) {
    throw new Error("Rapport npm audit invalide ou indisponible.");
  }
  const vulnerabilities = report.vulnerabilities;
  const allowed = [];
  const blocked = [];

  // Exceptions qui couvrent toutes les causes élevées d'un paquet, ou null s'il doit bloquer.
  // Une cause en dessous du seuil (minimatch, modéré) ne compte pas, comme pour npm audit.
  function coveredBy(name, visited = new Set()) {
    const entry = vulnerabilities[name];
    if (!entry || visited.has(name) || entry.severity !== "high" ||
        !entry.nodes?.length || !Array.isArray(entry.via)) return null;
    const causes = new Set();
    for (const cause of entry.via) {
      if (typeof cause === "string") {
        if (vulnerabilities[cause] && !blocking(vulnerabilities[cause].severity)) continue;
        const inherited = coveredBy(cause, new Set([...visited, name]));
        if (!inherited) return null;
        for (const exception of inherited) {
          if (!exception.dependents.has(name)) return null;
          causes.add(exception);
        }
      } else {
        if (!blocking(cause?.severity)) continue;
        const exception = exceptions.find((e) =>
          e.package === name && cause?.name === name && cause.url === e.advisory && cause.severity === "high");
        if (!exception) return null;
        causes.add(exception);
      }
    }
    // Chaque installation touchée doit être de développement, ou admise par toutes les exceptions en cause
    const installed = entry.nodes.every((node) => {
      const pkg = lockfile.packages?.[node];
      return pkg && (pkg.dev === true || [...causes].every((e) => e.production.has(node)));
    });
    return causes.size > 0 && installed ? causes : null;
  }

  for (const [name, entry] of Object.entries(vulnerabilities)) {
    if (!entry || entry.name !== name || !severities.has(entry.severity)) {
      throw new Error(`Entrée npm audit invalide : ${name}.`);
    }
    if (!blocking(entry.severity)) continue;
    (coveredBy(name) ? allowed : blocked).push(name);
  }
  return { allowed, blocked };
}

function main() {
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error("Lancer ce contrôle avec npm run audit:dependencies.");
  const result = spawnSync(process.execPath, [npm, "audit", "--json", "--audit-level=high", "--include=dev"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0 && result.status !== 1) throw new Error("Échec de la commande npm audit.");
  const report = JSON.parse(result.stdout);
  const lockfile = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
  const { allowed, blocked } = assessAudit(report, lockfile);
  if (allowed.length) {
    console.warn(`Exceptions temporaires (${allowed.join(", ")}) : ${EXCEPTIONS.map((e) => e.advisory).join(", ")}`);
  }
  if (blocked.length) {
    console.error("Vulnérabilités élevées ou critiques bloquantes :");
    console.error(JSON.stringify(Object.fromEntries(blocked.map((name) => [name, report.vulnerabilities[name]])), null, 2));
    process.exitCode = 1;
  } else {
    console.log("Audit des dépendances : aucune vulnérabilité élevée ou critique hors exception.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); }
  catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
