// npm run build puis npm start -- --port 3001 dans un autre terminal.
// npm run lighthouse -- --base http://localhost:3001 --profile /u/pseudo-public
// --path /wiki permet un contrôle ciblé ; CHROME_PATH choisit le navigateur installé.
import lighthouse from "lighthouse";
import { launch } from "chrome-launcher";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: {
  base: { type: "string", default: "http://localhost:3000" },
  profile: { type: "string" },
  path: { type: "string", multiple: true },
} });
if (!values.path && !/^\/u\/[^/?#]+$/.test(values.profile ?? "")) {
  console.error("Passer --profile /u/pseudo-public pour inclure un véritable profil public.");
  process.exit(1);
}
const paths = values.path ?? ["/", "/collection", "/marche", "/compte", values.profile, "/wiki", "/mentions-legales"];
const thresholds = { performance: 0.9, accessibility: 0.95, "best-practices": 0.95, seo: 0.95 };
const metrics = { "largest-contentful-paint": 2500, "cumulative-layout-shift": 0.1, "total-blocking-time": 200 };
const outDir = path.join(import.meta.dirname, "..", "reports", "lighthouse");
mkdirSync(outDir, { recursive: true });
const failures = [];
const rows = [];
const chrome = await launch({ chromeFlags: ["--headless=new"], chromePath: process.env.CHROME_PATH });
try {
  for (const route of paths) {
    const target = new URL(route, values.base);
    if (target.origin !== new URL(values.base).origin) throw new Error("Chaque page doit rester sur l'origine auditée.");
    console.log(`Audit ${route}…`);
    const slug = route === "/" ? "accueil" : route.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-");
    try {
      const result = await lighthouse(target.href, {
        port: chrome.port,
        output: ["json", "html"],
        onlyCategories: Object.keys(thresholds),
        formFactor: "mobile",
        screenEmulation: { mobile: true, width: 375, height: 812, deviceScaleFactor: 3, disabled: false },
        throttlingMethod: "simulate", // Throttling mobile par défaut de Lighthouse, sans ajustement.
        disableStorageReset: true, // Même session invitée entre les pages, navigateur éphémère.
      });
      if (!result) throw new Error("Aucun rapport");
      const report = result.lhr;
      const cspIssues = Object.fromEntries(Object.entries(result.artifacts?.InspectorIssues ?? {}).filter(([key]) => key.toLowerCase().includes("contentsecuritypolicy")));
      writeFileSync(path.join(outDir, `${slug}.csp.json`), JSON.stringify(cspIssues, null, 2));
      writeFileSync(path.join(outDir, `${slug}.report.json`), result.report[0]);
      writeFileSync(path.join(outDir, `${slug}.report.html`), result.report[1]);
      if (report.runtimeError) throw new Error(report.runtimeError.message);
      const finalPath = new URL(report.finalDisplayedUrl ?? report.finalUrl).pathname;
      if (finalPath.replace(/\/$/, "") !== target.pathname.replace(/\/$/, "")) failures.push(`${route} : redirection vers ${finalPath}, page demandée non auditée`);
      const scores = Object.fromEntries(Object.keys(thresholds).map((key) => [key, report.categories[key]?.score ?? 0]));
      const measured = Object.fromEntries(Object.keys(metrics).map((key) => [key, report.audits[key]?.numericValue ?? Infinity]));
      rows.push({ page: route, perf: Math.round(scores.performance * 100), a11y: Math.round(scores.accessibility * 100), bp: Math.round(scores["best-practices"] * 100), seo: Math.round(scores.seo * 100), "LCP ms": Math.round(measured["largest-contentful-paint"]), CLS: Number(measured["cumulative-layout-shift"].toFixed(3)), "TBT ms": Math.round(measured["total-blocking-time"]) });
      for (const [key, min] of Object.entries(thresholds)) if (scores[key] < min) failures.push(`${route} : ${key} ${Math.round(scores[key] * 100)} < ${min * 100}`);
      for (const [key, max] of Object.entries(metrics)) if (measured[key] >= max) failures.push(`${route} : ${key} ${measured[key]} >= ${max}`);
    } catch (error) {
      failures.push(`${route} : ${error.message}`);
    }
  }
} finally {
  await chrome.kill();
}
writeFileSync(path.join(outDir, "summary.json"), JSON.stringify({ at: new Date().toISOString(), rows, failures }, null, 2));
console.table(rows);
if (failures.length) {
  console.error(`Seuils non tenus :\n${failures.join("\n")}`);
  process.exitCode = 1;
} else console.log("Tous les seuils sont tenus.");
