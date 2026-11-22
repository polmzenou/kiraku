import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Clé du favori d'un membre de l'équipe (import Kyara) : 32 octets en base64url, glissée dans son favori et renvoyée
// avec chaque lot. Seule son empreinte est en base (KyaraStaffKey.keyHash), comme les jetons de connexion.

export function hashStaffKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function newStaffKey(): { key: string; hash: string } {
  const key = randomBytes(32).toString("base64url");
  return { key, hash: hashStaffKey(key) };
}

/** Empreinte en base contre clé reçue, en temps constant. */
export function staffKeyMatches(storedHash: string, key: string): boolean {
  const a = Buffer.from(storedHash, "hex");
  const b = Buffer.from(hashStaffKey(key), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
