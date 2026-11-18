import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Garde-fou du prestige : un exemplaire ne change de propriétaire que par moveCopy (server/collection/transfer.ts),
// qui remet « gardée par son propriétaire » à zéro et écrit la provenance d'un exemplaire spécial. Toute autre
// écriture de UserCard.ownerId dans le code de l'appli est une régression.

const ROOTS = ["server", "lib", "app", "components", "scripts"];
const ALLOWED = new Set([join("server", "collection", "transfer.ts")]);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" || name === "generated" ? [] : sources(path);
    return /\.(ts|tsx|mts)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Texte de l'appel qui commence à `open` (une parenthèse ouvrante), parenthèses équilibrées. */
function callText(source: string, open: number): string {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "(") depth++;
    else if (source[i] === ")" && --depth === 0) return source.slice(open, i + 1);
  }
  return source.slice(open);
}

/** Écritures de ownerId sur un exemplaire : appels Prisma update/updateMany/upsert et UPDATE "UserCard" bruts. */
export function ownerWrites(source: string): string[] {
  const found: string[] = [];
  for (const m of source.matchAll(/\.userCard\.(update|updateMany|upsert)\s*\(/g)) {
    const call = callText(source, m.index + m[0].length - 1);
    const data = call.slice(call.search(/\b(data|update|create)\s*:/));
    if (/\bownerId\b/.test(data)) found.push(call.slice(0, 80));
  }
  for (const m of source.matchAll(/UPDATE\s+"UserCard"([\s\S]*?)(\bWHERE\b|`)/gi)) {
    if (/"ownerId"\s*=/.test(m[1])) found.push(m[0].slice(0, 80));
  }
  return found;
}

describe("changement de propriétaire d'un exemplaire", () => {
  it("le détecteur reconnaît les deux formes d'écriture", () => {
    expect(ownerWrites(`tx.userCard.updateMany({ where: { id, ownerId: a }, data: { ownerId: b } })`)).toHaveLength(1);
    expect(ownerWrites("tx.$executeRaw`UPDATE \"UserCard\" SET \"ownerId\" = ${b} WHERE id = ${id}`")).toHaveLength(1);
    // Un filtre sur le propriétaire n'est pas une écriture
    expect(ownerWrites(`tx.userCard.updateMany({ where: { id, ownerId: a }, data: { status: "AUCTION" } })`)).toEqual([]);
  });

  it("n'est écrit que par moveCopy", () => {
    const offenders = ROOTS.flatMap((root) => sources(root))
      .filter((path) => !ALLOWED.has(relative(".", path).split("/").join(sep)))
      .flatMap((path) => ownerWrites(readFileSync(path, "utf8")).map((call) => `${path} : ${call}`));
    expect(offenders).toEqual([]);
    // Lit tout le code source : plus de 5 s quand la suite entière tourne en parallèle
  }, 30_000);

  it("moveCopy écrit bien le propriétaire (le garde-fou ne vise pas un fichier vide)", () => {
    expect(ownerWrites(readFileSync(join("server", "collection", "transfer.ts"), "utf8"))).toHaveLength(1);
  });
});
