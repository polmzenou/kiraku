import { createHash, randomBytes } from "node:crypto";

// Code d'un lien de traitement de l'équipe (#kiraku=<code>) : 32 octets en base64url. Seule son empreinte est en
// base (KyaraImport.nonceHash), comme les jetons de connexion.

export function hashNonce(nonce: string): string {
  return createHash("sha256").update(nonce).digest("hex");
}

export function newNonce(): { nonce: string; hash: string } {
  const nonce = randomBytes(32).toString("base64url");
  return { nonce, hash: hashNonce(nonce) };
}
