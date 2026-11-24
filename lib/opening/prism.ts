import type { Rarity } from "@/lib/catalog/rarity";
import { seeded } from "./reveal-scenes";

// Le « prisme » de l'ouverture : quand le tirage cache une XR, le sachet tremble et une lumière
// arc-en-ciel jaillit de la déchirure avant que les cartes sortent. Durées en ms.

/** Rareté qui déclenche le prisme. */
export const PRISM_RARITY: Rarity = "XR";

export const PRISM = {
  /** Tremblement du sachet, du premier frisson au « pop » final. */
  shakeMs: 1500,
  /** Tremblement allégé (appareil qui rame). */
  liteShakeMs: 1100,
  /** « Pop » du tremblement : anneau, éclair et seconde gerbe (même valeur que --pop dans PrismLight.css). */
  popMs: 1150,
  /** Attente ajoutée avant que les cartes montent : le spectacle se joue jusqu'au bout. */
  holdMs: 1100,
} as const;

/** Échos holographiques de la XR (rose, bleu, vert). */
export const XR_ECHOES = ["#ff67ba", "#78bfff", "#63ffba"] as const;
/** Palette holographique de la XR : la même du sachet à la révélation. */
export const HOLO = [...XR_ECHOES, "#ffe881", "#ffffff"] as const;
/** Arc-en-ciel du prisme, en pastel nacré et dans l'ordre du spectre (étincelles ; rayons et halo dans PrismLight.css). */
export const PRISM_SPECTRUM = ["#ffb3da", "#ffd7a8", "#fff3b8", "#b8ffdc", "#b8dcff", "#d8c2ff"] as const;

/** Le tirage contient-il une XR ? */
export const hasPrism = (cards: readonly { rarity: Rarity }[]): boolean => cards.some((c) => c.rarity === PRISM_RARITY);

export type PrismSpark = {
  /** Couleur prise dans l'arc-en-ciel. */
  color: string;
  /** Point de départ le long de la fente (% de la largeur). */
  left: number;
  /** Arrivée, en px depuis la fente. */
  dx: number;
  dy: number;
  size: number;
  /** Départ et durée (ms). */
  delay: number;
  duration: number;
};

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * Étincelles du prisme : elles jaillissent de toute la fente en éventail, chacune de sa couleur, en
 * deux salves (la seconde au « pop » du tremblement). Générateur stable : la même gerbe à chaque fois.
 */
export function prismSparks(lite: boolean): PrismSpark[] {
  const r = seeded(1717), total = lite ? 10 : 24;
  return Array.from({ length: total }, (_, i) => {
    const left = round(8 + (i / Math.max(1, total - 1)) * 84);
    const spread = (left - 50) / 50;
    const second = i % 2 === 1;
    return {
      color: PRISM_SPECTRUM[i % PRISM_SPECTRUM.length],
      left,
      dx: Math.round(spread * (40 + r() * 70)),
      dy: Math.round(-90 - r() * 150),
      size: Math.round(6 + r() * 6),
      delay: Math.round((second ? 900 : 120) + r() * 380),
      duration: Math.round(800 + r() * 500),
    };
  });
}

export type PrismShake = { x: number[]; rotate: number[]; scale: number[]; duration: number };

/**
 * Tremblement du sachet : de plus en plus fort (±2 → ±8 px, ±1 → ±2,5°), puis il gonfle et se relâche
 * d'un coup (le « pop »). Images clés pour Motion, transform seulement ; allégé : plus court et plus doux.
 */
export function prismShake(lite: boolean): PrismShake {
  const steps = lite ? 8 : 14, amp = lite ? 0.6 : 1;
  const x = [0], rotate = [0];
  for (let i = 1; i <= steps; i++) {
    const k = i / steps, side = i % 2 ? -1 : 1;
    x.push(round(side * (2 + 6 * k) * amp));
    rotate.push(round(side * (1 + 1.5 * k) * amp));
  }
  x.push(0);
  rotate.push(0);
  return { x, rotate, scale: [1, 1, 1.01, 1.02, 1.03, 1.06, 1], duration: (lite ? PRISM.liteShakeMs : PRISM.shakeMs) / 1000 };
}
