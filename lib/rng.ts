// Source de hasard injectée : le serveur passe crypto.randomInt pour les tirages,
// les tests, la simulation et le combat un générateur à graine (même graine = même suite).
import { hexToBytes, hmacSha256 } from "./sha256";

/** Entier uniforme dans [0, maxExclusive). */
export type Rng = (maxExclusive: number) => number;

/**
 * mulberry32 en flottants dans [0, 1) : générateur 32 bits rapide et reproductible (jamais utilisé pour les vrais
 * tirages). Sert aussi aux effets visuels qui doivent rejouer à l'identique (étincelles, feuilles d'or, lancer).
 */
export function seededFloat(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** mulberry32 en entiers : même suite que seededFloat pour une même graine. */
export function seededRng(seed: number): Rng {
  const next = seededFloat(seed);
  return (maxExclusive) => Math.floor(next() * maxExclusive);
}

const encoder = new TextEncoder();

/**
 * Hasard tiré d'une clé secrète (32 octets en hexadécimal) : mots de 32 bits de HMAC-SHA256(clé, « label:k »),
 * k = 0, 1… (8 mots par bloc, calculés seulement quand on en tire un). Reproductible avec la clé, imprévisible sans :
 * ce qu'on observe d'un label (les coups joués) n'apprend rien sur un autre. Même arrondi que seededRng.
 */
export function keyedRng(keyHex: string, label: string): Rng {
  const key = hexToBytes(keyHex);
  let block = 0;
  let words: DataView | null = null;
  let next = 8;
  return (maxExclusive) => {
    if (!words || next === 8) {
      words = new DataView(hmacSha256(key, encoder.encode(`${label}:${block++}`)).buffer);
      next = 0;
    }
    return Math.floor((words.getUint32(4 * next++) / 4_294_967_296) * maxExclusive);
  };
}

/** Mélange deux entiers 32 bits en une graine bien répartie (finaliseur de murmur3). */
export function mixSeed(a: number, b: number): number {
  let h = (a ^ Math.imul(b + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
