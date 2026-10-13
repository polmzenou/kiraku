import { hash, verify } from "@node-rs/argon2";

// argon2id, paramètres minimaux recommandés par l'OWASP (19 Mio, 2 passes).
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

// Hash d'un mot de passe jetable : vérifié quand l'e-mail n'existe pas, pour que
// la réponse prenne le même temps (pas d'indice sur les comptes existants).
let dummyHash: Promise<string> | null = null;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string | null, password: string): Promise<boolean> {
  if (!passwordHash) {
    dummyHash ??= hash("kiraku-dummy-password", OPTIONS);
    await verify(await dummyHash, password).catch(() => false);
    return false;
  }
  return verify(passwordHash, password).catch(() => false);
}
