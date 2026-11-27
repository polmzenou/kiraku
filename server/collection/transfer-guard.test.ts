import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Garde-fous statiques des cartes et des Zeni (règle n° 2 de CLAUDE.md), lus sur tout le code de l'appli :
//  - un exemplaire ne change de propriétaire que par moveCopy (server/collection/transfer.ts), qui remet « gardée par
//    son propriétaire » à zéro et écrit la provenance d'un exemplaire spécial (prestige) ;
//  - un changement de statut (mise en vente, combat, expédition, mise au casino, retour en collection) est une écriture
//    conditionnelle sur le statut attendu : un exemplaire déjà engagé ailleurs n'est jamais repris par un autre chemin ;
//  - un exemplaire ne disparaît (recyclage, renaissance, consécration, reprise du parrainage, retrait de l'admin) que
//    s'il est en collection ;
//  - seul server/economy/ledger.ts écrit le solde (User.coins) et le journal (CoinTransaction) : chaque mouvement de
//    Zeni a sa ligne, et la somme des soldes ne bouge que par les raisons du journal.
// Toute autre écriture est une régression. Une clé calculée (`[field]: value`) échappe à la lecture : la fiche admin
// n'en écrit que des compteurs (lib/admin/users.ts, USER_STATS), jamais le solde.

const ROOTS = ["server", "lib", "app", "components", "scripts"];
const OWNER_WRITERS = new Set([join("server", "collection", "transfer.ts")]);
const LEDGER = join("server", "economy", "ledger.ts");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" || name === "generated" ? [] : sources(path);
    return /\.(ts|tsx|mts)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Code sans ses lignes de commentaire : un exemple de requête cité en commentaire n'est pas une écriture. */
function code(path: string): string {
  return readFileSync(path, "utf8").replace(/^\s*(\/\/|\/\*|\*).*$/gm, "");
}

/** Tout le code de l'appli, lu une fois pour tous les garde-fous (chemins relatifs au dépôt). */
let codebase: { path: string; source: string }[] | null = null;
function readCodebase() {
  codebase ??= ROOTS.flatMap((root) => sources(root)).map((path) => ({ path: relative(".", path).split("/").join(sep), source: code(path) }));
  return codebase;
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

/** Appels Prisma `model.method(…)` du texte, en entier. */
function prismaCalls(source: string, model: string, methods: readonly string[]): { method: string; call: string }[] {
  const pattern = new RegExp(`\\.${model}\\.(${methods.join("|")})\\s*\\(`, "g");
  return [...source.matchAll(pattern)].map((m) => ({ method: m[1], call: callText(source, m.index + m[0].length - 1) }));
}

/** Retire les blocs `select: { … }` (accolades équilibrées) : une colonne relue n'est pas une colonne écrite. */
function withoutSelect(text: string): string {
  let out = text;
  for (let m = /\bselect\s*:\s*\{/.exec(out); m; m = /\bselect\s*:\s*\{/.exec(out)) {
    let depth = 0;
    let end = out.length;
    for (let i = m.index + m[0].length - 1; i < out.length; i++) {
      if (out[i] === "{") depth++;
      else if (out[i] === "}" && --depth === 0) {
        end = i + 1;
        break;
      }
    }
    out = out.slice(0, m.index) + out.slice(end);
  }
  return out;
}

/** Corps d'une requête SQL brute qui commence par `head` (jusqu'à la fin du gabarit). */
function rawStatements(source: string, head: RegExp): string[] {
  return [...source.matchAll(new RegExp(`${head.source}([\\s\\S]*?)\``, "gi"))].map((m) => m[1]);
}

/** Écritures de ownerId sur un exemplaire : appels Prisma update/updateMany/upsert et UPDATE "UserCard" bruts. */
export function ownerWrites(source: string): string[] {
  const found: string[] = [];
  for (const { call } of prismaCalls(source, "userCard", ["update", "updateMany", "upsert"])) {
    const data = call.slice(call.search(/\b(data|update|create)\s*:/));
    if (/\bownerId\b/.test(data)) found.push(call.slice(0, 80));
  }
  for (const m of source.matchAll(/UPDATE\s+"UserCard"([\s\S]*?)(\bWHERE\b|`)/gi)) {
    if (/"ownerId"\s*=/.test(m[1])) found.push(m[0].slice(0, 80));
  }
  return found;
}

export type StatusWrite = { text: string; status: string | null; guarded: boolean };

/** Changements de statut d'un exemplaire : `guarded` si l'écriture est conditionnée au statut d'avant. */
export function statusWrites(source: string): StatusWrite[] {
  const found: StatusWrite[] = [];
  for (const { call } of prismaCalls(source, "userCard", ["update", "updateMany"])) {
    const at = call.search(/\bdata\s*:/);
    if (at < 0) continue;
    const data = call.slice(at);
    if (!/\bstatus\b/.test(data)) continue;
    found.push({ text: call.slice(0, 100), status: /\bstatus\s*:\s*"([A-Z_]+)"/.exec(data)?.[1] ?? null, guarded: /\bstatus\b/.test(call.slice(0, at)) });
  }
  for (const body of rawStatements(source, /UPDATE\s+"UserCard"/)) {
    const where = body.search(/\bWHERE\b/i);
    const set = where < 0 ? body : body.slice(0, where);
    if (!/\bstatus\s*=/.test(set)) continue;
    found.push({ text: `UPDATE "UserCard"${body.slice(0, 80)}`, status: /\bstatus\s*=\s*'([A-Z_]+)'/.exec(set)?.[1] ?? null, guarded: where >= 0 && /\bstatus\s*=/.test(body.slice(where)) });
  }
  return found;
}

/** Suppressions d'exemplaires qui ne sont pas conditionnées à « en collection » (et toute suppression d'une ligne seule). */
export function unguardedDeletes(source: string): string[] {
  const found: string[] = [];
  for (const { method, call } of prismaCalls(source, "userCard", ["delete", "deleteMany"])) {
    if (method === "delete" || !/\bstatus\s*:\s*"COLLECTION"/.test(call)) found.push(call.slice(0, 100));
  }
  for (const body of rawStatements(source, /DELETE\s+FROM\s+"UserCard"/)) {
    if (!/\bstatus\s*=\s*'COLLECTION'/.test(body)) found.push(`DELETE FROM "UserCard"${body.slice(0, 80)}`);
  }
  return found;
}

/** Écritures du solde (User.coins) ou du journal (CoinTransaction), Prisma ou SQL brut. */
export function ledgerWrites(source: string): string[] {
  const found: string[] = [];
  for (const { call } of prismaCalls(source, "coinTransaction", ["create", "createMany", "update", "updateMany", "delete", "deleteMany", "upsert"])) {
    found.push(call.slice(0, 100));
  }
  for (const m of source.matchAll(/(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"CoinTransaction"/gi)) found.push(m[0]);
  for (const { call } of prismaCalls(source, "user", ["create", "createMany", "update", "updateMany", "upsert"])) {
    const at = call.search(/\b(data|create|update)\s*:/);
    if (at >= 0 && /\bcoins\b/.test(withoutSelect(call.slice(at)))) found.push(call.slice(0, 100));
  }
  for (const body of rawStatements(source, /UPDATE\s+"User"\s/)) {
    const where = body.search(/\bWHERE\b/i);
    if (/\bcoins\b|"coins"/.test(where < 0 ? body : body.slice(0, where))) found.push(`UPDATE "User" ${body.slice(0, 80)}`);
  }
  for (const m of source.matchAll(/INSERT\s+INTO\s+"User"\s*\(([^)]*)\)/gi)) {
    if (/\bcoins\b|"coins"/.test(m[1])) found.push(m[0].slice(0, 80));
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
    const offenders = readCodebase()
      .filter(({ path }) => !OWNER_WRITERS.has(path))
      .flatMap(({ path, source }) => ownerWrites(source).map((call) => `${path} : ${call}`));
    expect(offenders).toEqual([]);
    // Lit tout le code source : plus de 5 s quand la suite entière tourne en parallèle
  }, 30_000);

  it("moveCopy écrit bien le propriétaire (le garde-fou ne vise pas un fichier vide)", () => {
    expect(ownerWrites(code(join("server", "collection", "transfer.ts")))).toHaveLength(1);
  });
});

describe("statut d'un exemplaire engagé", () => {
  it("le détecteur distingue une écriture conditionnelle d'une écriture libre", () => {
    expect(statusWrites(`tx.userCard.updateMany({ where: { id, ownerId, status: "COLLECTION" }, data: { status: "CASINO" } })`)).toEqual([
      expect.objectContaining({ status: "CASINO", guarded: true }),
    ]);
    expect(statusWrites(`tx.userCard.updateMany({ where: { id, ownerId }, data: { status: "COLLECTION" } })`)).toEqual([
      expect.objectContaining({ status: "COLLECTION", guarded: false }),
    ]);
    expect(statusWrites("tx.$queryRaw`UPDATE \"UserCard\" SET status = 'COLLECTION' WHERE id = ${id} AND status = ${from}`")).toEqual([
      expect.objectContaining({ status: "COLLECTION", guarded: true }),
    ]);
    // Le statut relu (select) ou filtré seulement n'est pas une écriture
    expect(statusWrites(`tx.userCard.updateMany({ where: { id, status: "COLLECTION" }, data: { heritage: 2 } })`)).toEqual([]);
  });

  it("chaque engagement et chaque retour en collection dépend du statut d'avant", () => {
    const writes = readCodebase().flatMap(({ path, source }) => statusWrites(source).map((w) => ({ ...w, path })));
    expect(writes.filter((w) => !w.guarded).map((w) => `${w.path} : ${w.text}`)).toEqual([]);
    // Le garde-fou voit bien les engagements connus : vente, combat, expédition, casino, et les retours
    expect(new Set(writes.map((w) => w.status))).toEqual(new Set(["AUCTION", "BATTLE", "EXPEDITION", "CASINO", "COLLECTION"]));
  }, 30_000);

  it("un exemplaire ne disparaît que s'il est en collection", () => {
    expect(unguardedDeletes(`tx.userCard.deleteMany({ where: { id: { in: ids }, ownerId } })`)).toHaveLength(1);
    expect(unguardedDeletes(`tx.userCard.deleteMany({ where: { id: { in: ids }, ownerId, status: "COLLECTION" } })`)).toEqual([]);
    expect(unguardedDeletes("tx.$queryRaw`DELETE FROM \"UserCard\" uc WHERE uc.id = ${id}`")).toHaveLength(1);
    const offenders = readCodebase().flatMap(({ path, source }) => unguardedDeletes(source).map((call) => `${path} : ${call}`));
    expect(offenders).toEqual([]);
  }, 30_000);
});

describe("solde et journal des Zeni", () => {
  it("le détecteur reconnaît le solde et le journal, pas une simple lecture", () => {
    expect(ledgerWrites(`tx.user.update({ where: { id }, data: { coins: { increment: 5 } } })`)).toHaveLength(1);
    expect(ledgerWrites("tx.$executeRaw`UPDATE \"User\" SET coins = 0 WHERE id = ${id}`")).toHaveLength(1);
    expect(ledgerWrites(`tx.coinTransaction.create({ data: { userId, amount: 5, reason: "ADMIN" } })`)).toHaveLength(1);
    expect(ledgerWrites(`tx.user.update({ where: { id }, data: { prestige: 1 }, select: { coins: true } })`)).toEqual([]);
    expect(ledgerWrites("tx.$queryRaw`SELECT coins FROM \"User\" WHERE id = ${id} FOR UPDATE`")).toEqual([]);
    expect(ledgerWrites("tx.$executeRaw`UPDATE \"UserCard\" SET status = 'COLLECTION' WHERE coins > 0`")).toEqual([]);
  });

  it("seul ledger.ts écrit le solde et le journal", () => {
    const offenders = readCodebase()
      .filter(({ path }) => path !== LEDGER)
      .flatMap(({ path, source }) => ledgerWrites(source).map((call) => `${path} : ${call}`));
    expect(offenders).toEqual([]);
  }, 30_000);

  it("ledger.ts écrit bien les deux (le garde-fou ne vise pas un fichier vide)", () => {
    expect(ledgerWrites(code(LEDGER))).toHaveLength(2);
  });
});
