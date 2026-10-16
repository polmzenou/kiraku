import { describe, expect, it } from "vitest";
import { assessAudit } from "./audit-dependencies.mjs";

const advisory = {
  name: "braces",
  url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
  severity: "high",
};

function fixture() {
  const chain: Record<string, string | typeof advisory> = {
    "eslint-config-next": "@next/eslint-plugin-next",
    "@next/eslint-plugin-next": "fast-glob",
    "fast-glob": "micromatch",
    "micromatch": "braces",
    "braces": { ...advisory },
  };
  const vulnerabilities = Object.fromEntries(Object.entries(chain).map(([name, via]) => [name, {
    name, severity: "high", via: [via], nodes: [`node_modules/${name}`],
  }]));
  const packages: Record<string, { dev?: boolean }> = Object.fromEntries(
    Object.keys(chain).map((name) => [`node_modules/${name}`, { dev: true }]),
  );
  return { report: { auditReportVersion: 2, vulnerabilities }, lockfile: { packages } };
}

describe("audit des dépendances", () => {
  it("tolère uniquement l'alerte braces connue dans toute la chaîne de lint", () => {
    const { report, lockfile } = fixture();
    const result = assessAudit(report, lockfile);
    expect(result.blocked).toEqual([]);
    expect(result.allowed).toEqual(Object.keys(report.vulnerabilities));
  });

  it("bloque une autre alerte sur braces, même dans les dépendances de développement", () => {
    const { report, lockfile } = fixture();
    report.vulnerabilities.braces.via.push({ ...advisory, url: "https://github.com/advisories/GHSA-other" });
    expect(assessAudit(report, lockfile).blocked).toEqual(Object.keys(report.vulnerabilities));
  });

  it("bloque une nouvelle faille sur un parent de la chaîne", () => {
    const { report, lockfile } = fixture();
    report.vulnerabilities["eslint-config-next"].via.push({ ...advisory, name: "eslint-config-next" });
    expect(assessAudit(report, lockfile).blocked).toEqual(["eslint-config-next"]);
  });

  it("bloque la même alerte si braces est aussi utilisé en production", () => {
    const { report, lockfile } = fixture();
    delete lockfile.packages["node_modules/braces"].dev;
    expect(assessAudit(report, lockfile).blocked).toEqual(Object.keys(report.vulnerabilities));
  });

  it("vérifie toutes les installations affectées dans le lockfile", () => {
    const { report, lockfile } = fixture();
    report.vulnerabilities.braces.nodes.push("node_modules/runtime/node_modules/braces");
    lockfile.packages["node_modules/runtime/node_modules/braces"] = {};
    expect(assessAudit(report, lockfile).blocked).toContain("braces");
  });

  it("refuse l'exception si un paquet est absent du lockfile", () => {
    const { report, lockfile } = fixture();
    delete lockfile.packages["node_modules/braces"];
    expect(assessAudit(report, lockfile).blocked).toContain("braces");
  });

  it("bloque une faille critique même si son identifiant est connu", () => {
    const { report, lockfile } = fixture();
    report.vulnerabilities.braces.severity = "critical";
    expect(assessAudit(report, lockfile).blocked).toEqual(Object.keys(report.vulnerabilities));
  });

  it("bloque une nouvelle faille de développement sans rapport avec le lint", () => {
    const { report, lockfile } = fixture();
    report.vulnerabilities.other = {
      name: "other", severity: "high", via: [{ ...advisory, name: "other" }], nodes: ["node_modules/other"],
    };
    lockfile.packages["node_modules/other"] = { dev: true };
    expect(assessAudit(report, lockfile).blocked).toEqual(["other"]);
  });

  it("conserve le seuil high pour les alertes moins sévères", () => {
    const { report, lockfile } = fixture();
    report.vulnerabilities.braces.severity = "moderate";
    report.vulnerabilities = { braces: report.vulnerabilities.braces };
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
    { auditReportVersion: 2, vulnerabilities: { braces: {} } },
  ])("refuse un audit indisponible ou mal formé : %j", (report) => {
    expect(() => assessAudit(report, { packages: {} })).toThrow();
  });
});
