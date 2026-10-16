import { z } from "@/lib/zod";
import { seededRng } from "./rng";
import { slugSchema } from "./types";

// Rotation des familles « Par démographie » et « Par genre » : seuls quelques types sont proposés,
// tirés au hasard toutes les N heures (réglage booster.rotationHours). Le tirage est déterministe
// (graine = famille + numéro de fenêtre) : tous les serveurs proposent la même sélection sans rien stocker.
// L'admin peut épingler sa propre sélection : elle vaut jusqu'à la fin de la fenêtre en cours,
// puis le hasard reprend (le rythme des N heures ne bouge pas).

export const ROTATING_FAMILIES = ["demographie", "genre"] as const;
export type RotatingFamily = (typeof ROTATING_FAMILIES)[number];

export function isRotatingFamily(family: string): family is RotatingFamily {
  return (ROTATING_FAMILIES as readonly string[]).includes(family);
}

/** Sélection choisie par l'admin pour une fenêtre donnée (GameSetting booster.rotationPin). */
export const rotationPinSchema = z
  .object({
    window: z.number().int().min(0),
    /** Durée des fenêtres au moment de l'épinglage : changer la durée annule l'épingle. */
    hours: z.number().int().min(1),
    picks: z
      .object(
        Object.fromEntries(ROTATING_FAMILIES.map((f) => [f, z.array(slugSchema).min(1).max(50).optional()])) as {
          [F in RotatingFamily]: z.ZodOptional<z.ZodArray<typeof slugSchema>>;
        },
      )
      .strict(),
  })
  .strict();
export type RotationPin = z.infer<typeof rotationPinSchema>;

/** Décalage du fuseau à l'instant `at`, en ms (Europe/Paris en été : +2 h). */
export function timeZoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

export type RotationWindow = { index: number; startsAt: Date; endsAt: Date };

/**
 * Fenêtre de rotation en cours. Les fenêtres sont calées sur l'heure locale du jeu
 * (avec 12 h : minuit et midi) ; un changement d'heure décale au plus une fenêtre d'une heure.
 */
export function rotationWindow(now: Date, hours: number, timeZone: string): RotationWindow {
  const period = hours * 3_600_000;
  const offset = timeZoneOffsetMs(now, timeZone);
  const index = Math.floor((now.getTime() + offset) / period);
  const startsAt = new Date(index * period - offset);
  return { index, startsAt, endsAt: new Date(startsAt.getTime() + period) };
}

/** FNV-1a 32 bits : graine stable à partir d'un texte. */
function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** `count` types tirés au hasard (graine fixe), dans l'ordre des candidats. */
export function pickRotating(candidates: readonly string[], count: number, seed: string): string[] {
  const pool = [...new Set(candidates)].sort();
  const rng = seededRng(hashSeed(seed));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const chosen = new Set(pool.slice(0, Math.max(0, count)));
  return candidates.filter((slug) => chosen.has(slug));
}

export type RotationPick = { slugs: string[]; pinned: boolean };

/**
 * Types proposés dans chaque famille tournante. `candidates` : les types qui seraient proposés
 * sans rotation (ordre d'affichage). L'épingle de l'admin vaut pour sa fenêtre seulement ;
 * ses types devenus indisponibles sont ignorés (et le hasard reprend s'il n'en reste aucun).
 */
export function rotationSelection(input: {
  candidates: Record<RotatingFamily, readonly string[]>;
  counts: Record<RotatingFamily, number>;
  window: number;
  hours: number;
  pin: RotationPin | null;
}): Record<RotatingFamily, RotationPick> {
  const { candidates, counts, window, hours, pin } = input;
  const active = pin && pin.window === window && pin.hours === hours ? pin : null;
  return Object.fromEntries(
    ROTATING_FAMILIES.map((family) => {
      const list = candidates[family];
      const pinned = active?.picks[family]?.filter((slug) => list.includes(slug)) ?? [];
      if (pinned.length > 0) return [family, { slugs: list.filter((slug) => pinned.includes(slug)), pinned: true }];
      return [family, { slugs: pickRotating(list, counts[family], `${family}:${window}`), pinned: false }];
    }),
  ) as Record<RotatingFamily, RotationPick>;
}
