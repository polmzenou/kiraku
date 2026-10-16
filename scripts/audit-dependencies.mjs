import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Exception temporaire : aucun correctif de braces au 16/10/2026.
// Seuls les motifs locaux du lint passent par cette chaîne, jamais les entrées des joueurs.
// Retirer cette exception dès qu'une mise à jour compatible de Next.js élimine l'alerte.
const advisory = "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm";
const lintChain = new Map([
  ["eslint-config-next", "@next/eslint-plugin-next"],
  ["@next/eslint-plugin-next", "fast-glob"],
  ["fast-glob", "micromatch"],
  ["micromatch", "braces"],
]);
const severities = new Set(["info", "low", "moderate", "high", "critical"]);

export function assessAudit(report, lockfile) {
  if (report?.error || report?.auditReportVersion !== 2 || !report.vulnerabilities ||
      typeof report.vulnerabilities !== "object" || Array.isArray(report.vulnerabilities)) {
    throw new Error("Rapport npm audit invalide ou indisponible.");
  }
  const vulnerabilities = report.vulnerabilities;
  const allowed = [];
  const blocked = [];

  function isLintException(name, visited = new Set()) {
    const entry = vulnerabilities[name];
    if (!entry || visited.has(name) || entry.severity !== "high" ||
        !entry.nodes?.length || !entry.nodes.every((node) => lockfile.packages?.[node]?.dev === true) ||
        !Array.isArray(entry.via) || entry.via.length !== 1) return false;
    const cause = entry.via[0];
    if (name === "braces") {
      return cause?.name === "braces" && cause.url === advisory && cause.severity === "high";
    }
    return lintChain.has(name) && cause === lintChain.get(name) &&
      isLintException(cause, new Set([...visited, name]));
  }

  for (const [name, entry] of Object.entries(vulnerabilities)) {
    if (!entry || entry.name !== name || !severities.has(entry.severity)) {
      throw new Error(`Entrée npm audit invalide : ${name}.`);
    }
    if (entry.severity !== "high" && entry.severity !== "critical") continue;
    (isLintException(name) ? allowed : blocked).push(name);
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
    console.warn(`Exception temporaire de développement (${allowed.join(", ")}) : ${advisory}`);
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
