import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { DEV_ADMIN_PAGES } from "./roles";

// Périmètre du DEV dans /admin, vérifié sur les sources : il ouvre DEV_ADMIN_PAGES (lecture seule hors
// brouillons du catalogue), toutes les autres pages restent requireAdmin, et chaque écriture reste à l'admin.

const ROOT = join(process.cwd(), "app", "[locale]", "admin");
const ACTIONS = join(process.cwd(), "server", "actions");

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return pages(path);
    return name === "page.tsx" ? [path] : [];
  });
}

/** /admin/boosters/types/[slug] pour app/[locale]/admin/boosters/types/[slug]/page.tsx */
const hrefOf = (file: string) => `/admin/${relative(ROOT, file).split(sep).slice(0, -1).join("/")}`.replace(/\/$/, "");

/** Page d'une entrée de DEV_ADMIN_PAGES, ou sous-page dynamique de l'une d'elles (fiche d'un joueur, d'un type). */
function openToDev(href: string) {
  const base = href.replace(/\/\[[^\]]+\]$/, "");
  return (DEV_ADMIN_PAGES as readonly string[]).includes(base) || /^\/admin\/catalogue(\/|$)/.test(href);
}

describe("accès du DEV à l'admin", () => {
  const files = pages(ROOT);

  it("chaque entrée de DEV_ADMIN_PAGES est une vraie page", () => {
    const hrefs = new Set(files.map(hrefOf));
    for (const href of DEV_ADMIN_PAGES) expect(hrefs, href).toContain(href);
  });

  it("les pages ouvertes au DEV ne demandent plus le rôle admin, les autres si", () => {
    for (const file of files) {
      const href = hrefOf(file);
      const source = readFileSync(file, "utf8");
      if (href === "/admin" || href === "/admin/catalogue/raretes") continue; // accueil : redirige le DEV ; raretés : admin seul
      if (openToDev(href)) expect(source, href).not.toMatch(/\brequireAdmin\(\)/);
      else expect(source, href).toMatch(/\brequireAdmin\(\)/);
    }
    expect(readFileSync(join(ROOT, "catalogue", "raretes", "page.tsx"), "utf8")).toMatch(/\brequireAdmin\(\)/);
  });

  it("chaque Server Action d'écriture de l'admin revérifie le rôle ADMIN", () => {
    const files = readdirSync(ACTIONS).filter((n) => /^admin-.*\.ts$/.test(n) && !n.endsWith(".test.ts"));
    for (const name of files) {
      const source = readFileSync(join(ACTIONS, name), "utf8");
      // Le catalogue passe par getStaff() + son périmètre « drafts » (lib/admin/roles.ts)
      expect(source, name).toMatch(name === "admin-catalog.ts" ? /\bgetStaff\(\)/ : /\bgetAdmin\(\)/);
      expect(source, name).not.toMatch(/\brequireAdminView\b/);
    }
  });
});
