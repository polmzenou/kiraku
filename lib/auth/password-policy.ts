// Règles d'un nouveau mot de passe, au-delà de la longueur (schemas.ts) : pas un mot de passe
// courant, pas le pseudo ou l'e-mail, pas une suite prévisible. Pur et sans dépendance : le
// serveur l'applique (registerSchema, resetPasswordSchema), la jauge de l'interface s'en sert.

/** Mots de passe parmi les plus utilisés (fuites publiques), en minuscules, ≥ 10 caractères. */
const COMMON = new Set([
  "1234567890",
  "0123456789",
  "0987654321",
  "12345678910",
  "123456789a",
  "a123456789",
  "1q2w3e4r5t",
  "1qaz2wsx3edc",
  "qwertyuiop",
  "azertyuiop",
  "qwerty1234",
  "azerty1234",
  "qwerty123456",
  "azerty123456",
  "password12",
  "password123",
  "password1234",
  "motdepasse",
  "motdepasse1",
  "motdepasse123",
  "iloveyou12",
  "iloveyou123",
  "jetaime123",
  "doudou1234",
  "soleil1234",
  "football12",
  "football123",
  "baseball123",
  "superman123",
  "naruto1234",
  "naruto123456",
  "dragonball",
  "dragonball123",
  "onepiece123",
  "onepiece1234",
  "pokemon123",
  "pokemon1234",
  "sasuke1234",
  "goku123456",
  "kiraku1234",
  "kiraku123456",
  "princess123",
  "sunshine12",
  "welcome123",
  "letmein123",
  "monkey1234",
  "dragon1234",
  "master1234",
  "abcdefghij",
  "abc1234567",
  "aaaaaaaaaa",
  "1111111111",
  "0000000000",
  "1234512345",
  "1234qwer",
  "qazwsxedc123",
  "zaq12wsxcde3",
]);

export type PasswordProblem = "passwordCommon" | "passwordPersonal" | "passwordWeak";

export type PasswordContext = { username?: string | null; email?: string | null };

function simplify(text: string): string {
  return text.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Suite de caractères qui se suivent (« abcdef », « 98765 ») ou se répètent (« ababab »). */
function predictable(p: string): boolean {
  if (new Set(p).size <= 3) return true;
  let steps = 0;
  for (let i = 1; i < p.length; i++) {
    const d = p.charCodeAt(i) - p.charCodeAt(i - 1);
    if (d === 1 || d === -1 || d === 0) steps++;
  }
  if (steps >= p.length - 2) return true;
  // Motif court répété : « abcabcabca »
  for (let len = 1; len <= 4; len++) {
    const unit = p.slice(0, len);
    if (unit.repeat(Math.ceil(p.length / len)).slice(0, p.length) === p) return true;
  }
  return false;
}

/** Première règle enfreinte, ou null. La longueur est vérifiée à part (schemas.ts). */
export function passwordProblem(password: string, ctx: PasswordContext = {}): PasswordProblem | null {
  const p = simplify(password);
  // « Naruto1234! » reste un mot de passe courant : on retire chiffres et symboles en fin
  if (COMMON.has(p) || COMMON.has(p.replace(/[^\p{L}\p{N}]+$/u, ""))) return "passwordCommon";

  const personal = [ctx.username, ctx.email?.split("@")[0]]
    .filter((s): s is string => typeof s === "string" && s.length >= 3)
    .map(simplify);
  if (personal.some((s) => p.includes(s))) return "passwordPersonal";

  if (predictable(p)) return "passwordWeak";
  return null;
}

/**
 * Solidité de 0 à 4 pour la jauge : longueur et variété, ramenée à 0 si une règle est enfreinte.
 * Indication seulement : le serveur ne refuse que les règles de passwordProblem et la longueur.
 */
export function passwordStrength(password: string, ctx: PasswordContext = {}, minLength = 10): 0 | 1 | 2 | 3 | 4 {
  if (password.length === 0) return 0;
  if (password.length < minLength || passwordProblem(password, ctx)) return password.length < minLength / 2 ? 0 : 1;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  let score = 2;
  if (password.length >= 14 || classes >= 3) score++;
  if (password.length >= 18 || (password.length >= 12 && classes === 4)) score++;
  return Math.min(4, score) as 2 | 3 | 4;
}
