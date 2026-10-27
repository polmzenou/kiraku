// Audit des Server Actions (CLAUDE.md, règle 3) : chaque fonction exportée d'un fichier "use server"
// doit vérifier la session (ou le rôle admin), valider ses entrées avec Zod et passer par un rate
// limit. Les appels aux fonctions locales du fichier sont suivis (gardes partagées comme guard()).
//   npm run audit:actions          échoue (code 1) s'il manque un contrôle hors exceptions listées
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.join(import.meta.dirname, "..");
const IGNORED = new Set(["node_modules", ".git", ".next", ".agents", ".codex", "generated", "reports", "coverage"]);
function sourceFiles(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    if (IGNORED.has(entry.name)) return [];
    const relative = path.posix.join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(relative) : /\.[cm]?[jt]sx?$/.test(entry.name) && !/\.test\./.test(entry.name) ? [relative] : [];
  });
}

const CHECKS = {
  session: /\b(getCurrentUser|requireActiveUser|getAdmin|requireAdmin|getStaff|requireStaff)\s*\(/,
  zod: /\.(safeParse|parse)\s*\(|Schema\.safeParse/,
  rateLimit: /\brateLimit\s*\(/,
} as const;
type Check = keyof typeof CHECKS;

/**
 * Exceptions justifiées : fichier:fonction → contrôles non exigés, avec la raison.
 * Tout ajout ici se relit en revue.
 */
const EXCEPTIONS: Record<string, { skip: Check[]; why: string }> = {
  "account.ts:register": { skip: ["session"], why: "inscription : pas encore de compte (invité facultatif)" },
  "account.ts:login": { skip: ["session"], why: "connexion : par nature sans session" },
  "account.ts:requestPasswordReset": { skip: ["session"], why: "mot de passe oublié : sans session, limité par IP et e-mail" },
  "account.ts:resetPassword": { skip: ["session"], why: "lien reçu par e-mail : jeton à usage unique" },
  "account.ts:verifyEmail": { skip: ["session"], why: "lien reçu par e-mail : jeton à usage unique" },
  "account.ts:logout": { skip: ["zod"], why: "aucune entrée" },
  "account.ts:resendVerification": { skip: ["zod"], why: "aucune entrée" },
  "auth.ts:ensureGuest": { skip: ["session", "zod"], why: "crée la session invitée, limité par IP, aucune entrée" },
  "data.ts:cancelDeletionAction": { skip: ["zod"], why: "aucune entrée" },
  "discord.ts:joinDiscordAction": { skip: ["zod"], why: "aucune entrée" },
};

type Fn = { name: string; exported: boolean; body: string; params: number };

/** Fonctions du fichier (déclarations et constantes fléchées), lues avec le compilateur TypeScript. */
function functions(file: string, src: string): Fn[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
  const out: Fn[] = [];
  const exported = (node: ts.Node) =>
    ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  // Seulement les expressions appelées : un commentaire ou une chaîne contenant « rateLimit() »
  // ne doit jamais faire passer un contrôle. Les helpers locaux sont suivis ensuite.
  const calls = (node: ts.Node): string => {
    const found: string[] = [];
    const visit = (child: ts.Node) => {
      if (ts.isCallExpression(child) && child.expression.getText(sf) !== "JSON.parse") found.push(child.expression.getText(sf) + "(");
      ts.forEachChild(child, visit);
    };
    visit(node);
    return found.join("\n");
  };
  for (const stmt of sf.statements) {
    if (ts.isExportAssignment(stmt)) {
      out.push({ name: "default", exported: true, body: calls(stmt.expression), params: ts.isArrowFunction(stmt.expression) || ts.isFunctionExpression(stmt.expression) ? stmt.expression.parameters.length : 1 });
    } else if (ts.isFunctionDeclaration(stmt)) {
      out.push({ name: stmt.name?.text ?? "default", exported: exported(stmt), body: calls(stmt), params: stmt.parameters.length });
    } else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        const init = decl.initializer;
        if (ts.isIdentifier(decl.name) && init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          out.push({ name: decl.name.text, exported: exported(stmt), body: calls(init), params: init.parameters.length });
        }
      }
    }
  }
  for (const stmt of sf.statements) {
    if (!ts.isExportDeclaration(stmt) || stmt.isTypeOnly) continue;
    if (stmt.moduleSpecifier || !stmt.exportClause || !ts.isNamedExports(stmt.exportClause)) {
      throw new Error(`${file} : réexport externe non auditable ; exporter une fonction locale explicite.`);
    }
    for (const spec of stmt.exportClause.elements) {
      if (spec.isTypeOnly) continue;
      const fn = out.find((f) => f.name === (spec.propertyName ?? spec.name).text);
      if (!fn) throw new Error(`${file} : export ${spec.name.text} non auditable.`);
      fn.exported = true;
    }
  }
  return out;
}

/** Texte de la fonction et des fonctions locales qu'elle appelle (deux niveaux). */
function closure(fn: Fn, all: Map<string, Fn>, seen = new Set<string>()): string {
  if (seen.has(fn.name)) return "";
  seen.add(fn.name);
  let text = fn.body;
  for (const [name, other] of all) {
    if (new RegExp(`\\b${name}\\s*\\(`).test(fn.body)) text += "\n" + closure(other, all, seen);
  }
  return text;
}

const problems: string[] = [];
let audited = 0;

  for (const file of sourceFiles("")) {
    const src = readFileSync(path.join(ROOT, file), "utf8");
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
    if (!sf.statements.some((s) => ts.isExpressionStatement(s) && ts.isStringLiteral(s.expression) && s.expression.text === "use server")) continue;
    const fns = functions(file, src);
    const byName = new Map(fns.map((f) => [f.name, f]));
    for (const fn of fns.filter((f) => f.exported)) {
      audited++;
      const text = closure(fn, byName);
      const exception = file.startsWith("server/actions/") ? EXCEPTIONS[`${path.basename(file)}:${fn.name}`] : undefined;
      // Une action sans paramètre n'a rien à valider
      const takesInput = fn.params > 0;
      for (const check of Object.keys(CHECKS) as Check[]) {
        if (exception?.skip.includes(check)) continue;
        if (check === "zod" && !takesInput) continue;
        if (!CHECKS[check].test(text)) problems.push(`${file} → ${fn.name} : contrôle « ${check} » introuvable`);
      }
    }
  }

console.log(`${audited} Server Actions auditées, ${Object.keys(EXCEPTIONS).length} exceptions justifiées.`);
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("Aucun contrôle manquant.");
