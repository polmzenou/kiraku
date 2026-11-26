import { createHmac } from "node:crypto";
import { isSeedHex } from "@/lib/casino/fairness";

// Graine scellée d'une table de pile ou face. À la pose, la base ne garde qu'un nonce tiré par le serveur et
// l'engagement SHA-256 de la graine ; la graine du lancer vaut HMAC-SHA256(clé, nonce), avec une clé dérivée
// d'AUTH_SECRET (jamais le secret lui-même) et passée par l'appelant. Une copie de la base (sauvegarde, accès SQL,
// copie locale) ne donne donc plus l'issue des tables ouvertes. Une fois la table jouée, la graine est écrite en
// clair : la vérification du joueur ne change pas (SHA-256(graine) = engagement, HMAC(graine, id) = issue).
// Les tables posées avant ce changement gardent leur graine en clair (seedNonce nul) et se jouent comme avant.

/** Clé des graines, dérivée du secret de l'app. */
export function coinFlipSeedKey(authSecret: string): Buffer {
  return createHmac("sha256", authSecret).update("kiraku/casino/coinflip-seed").digest();
}

/** Graine d'une table scellée : HMAC-SHA256(clé, octets du nonce), en hexadécimal minuscule (64 caractères). */
export function sealedSeed(key: Uint8Array, nonce: string): string {
  if (!isSeedHex(nonce)) throw new Error("Nonce de table invalide");
  return createHmac("sha256", key).update(Buffer.from(nonce, "hex")).digest("hex");
}

/** Graine à lancer : en clair pour une ancienne table, retrouvée depuis le nonce sinon ; null si la ligne n'a ni l'une ni l'autre. */
export function tableSeed(flip: { seed: string | null; seedNonce: string | null }, key: Uint8Array): string | null {
  if (flip.seed) return flip.seed;
  return flip.seedNonce ? sealedSeed(key, flip.seedNonce) : null;
}
