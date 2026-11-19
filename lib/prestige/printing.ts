import type { FudaCopy } from "@/components/fuda/Fuda";
import { isEngraved } from "@/lib/collection/copies";
import type { Rng } from "@/lib/rng";

// Éditions gravées numérotées (prestige, étape 16c). Le serveur décide de tout : tirage au sort de la gravure à
// l'ouverture, numéro libre tiré au hasard dans le tirage en cours. Logique pure, testable sans base.

/** Réglages prestige.printing.* utiles à l'ouverture. */
export type PrintingRules = {
  minPrestige: number;
  /** Chance par carte tirée, en points de base (sur 10 000), par clé de rareté ; absente ou 0 : jamais gravée. */
  chanceBp: Record<string, number>;
  /** Taille d'un tirage par rareté, figée à la création de son compteur. */
  sizes: Record<string, number>;
  /** Tirage en cours. */
  current: number;
};

/** Édition d'un exemplaire gravé : tirage, numéro, taille figée du tirage. */
export type Edition = { printing: number; serial: number; size: number };

/** Rareté la plus basse qui peut sortir gravée : seules les Mythiques et les raretés au-dessus le sont. */
export const PRINTING_FLOOR = "MYTHIC";
export const DEFAULT_PRINTING_SIZE = 25;
const BP = 10_000;

/**
 * Une rareté se grave si elle est au moins Mythique dans l'ordre des raretés et que sa chance est réglée. Une rareté
 * hors de l'ordre connu, ou un ordre sans Mythique, ne se grave jamais : le plancher ne se contourne pas par le réglage.
 */
export function engravable(rarity: string, order: readonly string[], rules: Pick<PrintingRules, "chanceBp">): boolean {
  const floor = order.indexOf(PRINTING_FLOOR);
  const at = order.indexOf(rarity);
  return floor >= 0 && at >= floor && (rules.chanceBp[rarity] ?? 0) > 0;
}

/**
 * Positions des cartes tirées qui sortent gravées : un tirage au sort par carte d'une rareté gravable, dans l'ordre
 * des cartes. Sous le prestige minimal, rien n'est tiré et le générateur n'est pas consommé (les tirages à graine des
 * tests ne bougent pas).
 */
export function rollEngravings(
  rng: Rng,
  cards: readonly { rarity: string }[],
  ctx: { prestige: number; order: readonly string[]; rules: PrintingRules },
): number[] {
  if (ctx.prestige < ctx.rules.minPrestige) return [];
  const picked: number[] = [];
  cards.forEach((card, i) => {
    if (!engravable(card.rarity, ctx.order, ctx.rules)) return;
    if (rng(BP) < Math.min(BP, ctx.rules.chanceBp[card.rarity] ?? 0)) picked.push(i);
  });
  return picked;
}

/** Taille d'un nouveau tirage pour cette rareté. */
export function printingSize(rarity: string, rules: Pick<PrintingRules, "sizes">): number {
  return rules.sizes[rarity] ?? DEFAULT_PRINTING_SIZE;
}

/** Numéro libre tiré au hasard (uniforme) parmi 1…size hors des numéros déjà sortis ; null si le tirage est épuisé. */
export function pickFreeSerial(rng: Rng, size: number, taken: readonly number[]): number | null {
  const out = new Set(taken);
  const free: number[] = [];
  for (let n = 1; n <= size; n++) if (!out.has(n)) free.push(n);
  if (free.length === 0) return null;
  return free[rng(free.length)] ?? null;
}

/** Sceau d'un tirage (« 初摺 » pour le premier) ; null s'il n'est pas réglé. */
export function sealOf(printing: number, seals: Readonly<Record<string, string>>): string | null {
  return seals[String(printing)] || null;
}

/** Ce qu'une fuda montre d'un exemplaire précis ; null pour un exemplaire ordinaire (la fuda reste inchangée). */
export function fudaCopyOf(
  copy: { heritage: number; printing: number | null; serial: number | null; size?: number | null },
  seals: Readonly<Record<string, string>>,
): FudaCopy | null {
  if (!isEngraved(copy)) return copy.heritage > 0 ? { heritage: copy.heritage, printing: null, serial: null, size: null, seal: null } : null;
  return { heritage: copy.heritage, printing: copy.printing, serial: copy.serial, size: copy.size ?? null, seal: sealOf(copy.printing, seals) };
}

/** Éditions d'une ouverture (BoosterOpening.editions), relues sans faire confiance au JSON stocké. */
export function readEditions(raw: unknown): Map<number, Edition> {
  const out = new Map<number, Edition>();
  if (!Array.isArray(raw)) return out;
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const { position, printing, serial, size } = e as Record<string, unknown>;
    const ints = [position, printing, serial, size].every((v) => typeof v === "number" && Number.isInteger(v));
    if (ints && (position as number) >= 0 && (printing as number) >= 1 && (serial as number) >= 1 && (serial as number) <= (size as number)) {
      out.set(position as number, { printing: printing as number, serial: serial as number, size: size as number });
    }
  }
  return out;
}
