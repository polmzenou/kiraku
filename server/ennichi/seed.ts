import { createHmac } from "node:crypto";
import { sealedSeed, tableSeed } from "../casino/seed";

// Graine scellée du tirage de l'Ennichi, sur le modèle des tables du casino (server/casino/seed.ts) : à l'engagement,
// la base ne garde qu'un nonce tiré par le serveur et l'empreinte SHA-256 de la graine ; la graine vaut
// HMAC-SHA256(clé, nonce), avec une clé dérivée d'AUTH_SECRET (jamais le secret lui-même, et une autre que celle du
// casino) passée par l'appelant. Une copie de la base (sauvegarde, accès SQL, synchro locale) ne donne donc plus le
// résultat du tirage avant qu'il soit fait. Au tirage, la graine est écrite en clair : la vérification du joueur ne
// change pas (SHA-256(graine) = empreinte publiée, tirage refait à l'identique). Une édition engagée avant ce
// changement garde sa graine en clair (seedNonce nul) et se tire comme avant.

/** Clé des graines de l'Ennichi, dérivée du secret de l'app. */
export function ennichiSeedKey(authSecret: string): Buffer {
  return createHmac("sha256", authSecret).update("kiraku/ennichi/omikuji-seed").digest();
}

/** Graine d'une édition scellée : HMAC-SHA256(clé, octets du nonce), en hexadécimal minuscule (64 caractères). */
export const ennichiSealedSeed = sealedSeed;

/** Graine à tirer : en clair pour une édition d'avant, retrouvée depuis le nonce sinon ; null si la ligne n'a ni l'une ni l'autre. */
export const editionSeed: (draw: { seed: string | null; seedNonce: string | null }, key: Uint8Array) => string | null = tableSeed;
