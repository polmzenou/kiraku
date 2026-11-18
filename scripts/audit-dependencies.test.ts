import { describe, expect, it } from "vitest";
import { assessAudit } from "./audit-dependencies.mjs";

const advisory = {
  name: "picomatch",
  url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf",
  severity: "high",
};

type Cause = string | { name: string; url: string; severity: string } | null;
type Entry = { name: string; severity: string; via: Cause[]; nodes: string[] };

// Graphe réel de l'alerte (npm audit du 18/11/2026), réduit : lint, Vite/Vitest et next-intl.
function fixture() {
  const graph: Record<string, Cause[]> = {
    picomatch: [{ ...advisory }],
    micromatch: ["picomatch"],
    "fast-glob": ["micromatch"],
    "@next/eslint-plugin-next": ["fast-glob"],
    "eslint-config-next": ["@next/eslint-plugin-next"],
    fdir: ["picomatch"],
    tinyglobby: ["fdir", "picomatch"],
    vite: ["picomatch", "tinyglobby"],
    vitest: ["picomatch", "tinyglobby", "vite"],
    "@typescript-eslint/typescript-estree": ["minimatch", "tinyglobby"],
    "@parcel/watcher": ["picomatch"],
  };
  const vulnerabilities: Record<string, Entry> = Object.fromEntries(Object.entries(graph).map(([name, via]) => [name, {
    name, severity: "high", via, nodes: [`node_modules/${name}`],
  }]));
  vulnerabilities.minimatch = {
    name: "minimatch", severity: "moderate", nodes: ["node_modules/minimatch"],
    via: [{ name: "minimatch", url: "https://github.com/advisories/GHSA-g3hv-75wg-m249", severity: "moderate" }],
  };
  vulnerabilities.picomatch.nodes.push("node_modules/@parcel/watcher/node_modules/picomatch");
  const packages: Record<string, { dev?: boolean }> = Object.fromEntries(
    Object.keys(vulnerabilities).map((name) => [`node_modules/${name}`, { dev: true }]),
  );
  // next-intl (dépendance de production) tire @parcel/watcher et sa copie de picomatch
  packages["node_modules/@parcel/watcher"] = {};
  packages["node_modules/@parcel/watcher/node_modules/picomatch"] = {};
  return { report: { auditReportVersion: 2, vulnerabilities }, lockfile: { packages } };
}

const high = (vulnerabilities: Record<string, Entry>) =>
  Object.keys(vulnerabilities).filter((name) => ["high", "critical"].includes(vulnerabilities[name].severity));

describe("audit des dépendances", () => {
  it("tolère l'alerte picomatch connue chez tous ses héritiers déclarés", () => {
    const { report, lockfile } = fixture();
    expect(assessAudit(report, lockfile)).toEqual({ allowed: high(report.vulnerabilities), blocked: [] });
  });

  it("bloque une autre alerte sur picomatch, même dans les dépendances de développement", () => {
    const { report, lockfile } = fixture();
    report.vulnerabilities.picomatch.via.push({ ...advisory, url: "https://github.com/advisories/GHSA-other" });
    expect(assessAudit(report, lockfile).blocked).toEqual(high(report.vulnerabilities));
  });

  it("bloque une nouvelle faille sur un héritier", () => {
    const { report, lockfile } = fixture();
    report.vulnerabilities["eslint-config-next"].via.push({ ...advisory, name: "eslint-config-next" });
    expect(assessAudit(report, lockfile).blocked).toEqual(["eslint-config-next"]);
  });

  it("bloque un nouvel héritier tant qu'il n'est pas déclaré", () => {
    const { report, lockfile } = fixture();
    report.vulnerabilities["new-tool"] = { name: "new-tool", severity: "high", via: ["picomatch"], nodes: ["node_modules/new-tool"] };
    lockfile.packages["node_modules/new-tool"] = { dev: true };
    expect(assessAudit(report, lockfile).blocked).toEqual(["new-tool"]);
  });

  it("bloque picomatch installé en production ailleurs que sous @parcel/watcher", () => {
    const { report, lockfile } = fixture();
    report.vulnerabilities.picomatch.nodes.push("node_modules/runtime/node_modules/picomatch");
    lockfile.packages["node_modules/runtime/node_modules/picomatch"] = {};
    expect(assessAudit(report, lockfile).blocked).toEqual(high(report.vulnerabilities));
  });

  it("bloque un héritier de développement passé en production, et ce qui en dépend", () => {
    const { report, lockfile } = fixture();
    delete lockfile.packages["node_modules/vite"].dev;
    expect(assessAudit(report, lockfile).blocked).toEqual(["vite", "vitest"]);
  });

  it("refuse l'exception si un paquet est absent du lockfile", () => {
    const { report, lockfile } = fixture();
    delete lockfile.packages["node_modules/picomatch"];
    expect(assessAudit(report, lockfile).blocked).toContain("picomatch");
  });

  it("bloque une faille critique même si son identifiant est connu", () => {
    const { report, lockfile } = fixture();
    report.vulnerabilities.picomatch.severity = "critical";
    expect(assessAudit(report, lockfile).blocked).toEqual(high(report.vulnerabilities));
  });

  it("ignore une cause sous le seuil, mais pas si elle devient élevée", () => {
    const { report, lockfile } = fixture();
    report.vulnerabilities.minimatch.severity = "high";
    report.vulnerabilities.minimatch.via = [{ name: "minimatch", url: "https://github.com/advisories/GHSA-g3hv-75wg-m249", severity: "high" }];
    expect(assessAudit(report, lockfile).blocked.sort()).toEqual(["@typescript-eslint/typescript-estree", "minimatch"]);
  });

  it("bloque une nouvelle faille de développement sans rapport avec l'exception", () => {
    const { report, lockfile } = fixture();
    report.vulnerabilities.other = {
      name: "other", severity: "high", via: [{ ...advisory, name: "other" }], nodes: ["node_modules/other"],
    };
    lockfile.packages["node_modules/other"] = { dev: true };
    expect(assessAudit(report, lockfile).blocked).toEqual(["other"]);
  });

  it("bloque un cycle ou une cause illisible sans boucler ni planter", () => {
    const { report, lockfile } = fixture();
    report.vulnerabilities.a = { name: "a", severity: "high", via: ["b"], nodes: ["node_modules/a"] };
    report.vulnerabilities.b = { name: "b", severity: "high", via: ["a"], nodes: ["node_modules/b"] };
    report.vulnerabilities.c = { name: "c", severity: "high", via: [null], nodes: ["node_modules/c"] };
    for (const name of ["a", "b", "c"]) lockfile.packages[`node_modules/${name}`] = { dev: true };
    expect(assessAudit(report, lockfile).blocked).toEqual(["a", "b", "c"]);
  });

  it("conserve le seuil high pour les alertes moins sévères", () => {
    const { report, lockfile } = fixture();
    report.vulnerabilities.picomatch.severity = "moderate";
    report.vulnerabilities = { picomatch: report.vulnerabilities.picomatch };
    expect(assessAudit(report, lockfile)).toEqual({ allowed: [], blocked: [] });
  });

  it("accepte un rapport sans vulnérabilités", () => {
    expect(assessAudit({ auditReportVersion: 2, vulnerabilities: {} }, { packages: {} }))
      .toEqual({ allowed: [], blocked: [] });
  });

  it.each([
    { error: { code: "ENOTFOUND" } },
    {},
    { auditReportVersion: 2 },
    { auditReportVersion: 2, vulnerabilities: [] },
    { auditReportVersion: 2, vulnerabilities: { picomatch: {} } },
  ])("refuse un audit indisponible ou mal formé : %j", (report) => {
    expect(() => assessAudit(report, { packages: {} })).toThrow();
  });
});
