// Source de hasard injectée : le serveur passe crypto.randomInt pour les tirages,
// les tests, la simulation et le combat un générateur à graine (même graine = même suite).

/** Entier uniforme dans [0, maxExclusive). */
export type Rng = (maxExclusive: number) => number;

/** mulberry32 : générateur 32 bits rapide et reproductible (jamais utilisé pour les vrais tirages). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return (maxExclusive) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const u = ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    return Math.floor(u * maxExclusive);
  };
}

/** Mélange deux entiers 32 bits en une graine bien répartie (finaliseur de murmur3). */
export function mixSeed(a: number, b: number): number {
  let h = (a ^ Math.imul(b + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
