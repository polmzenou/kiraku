// Source de hasard injectée dans le tirage : le serveur passe crypto.randomInt,
// les tests et la simulation un générateur à graine (même graine = même tirage).

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
