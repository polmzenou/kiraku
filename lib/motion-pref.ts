/**
 * Réglage « Animations » : `auto` laisse l'appareil choisir (effets allégés s'il rame), `full` et
 * `lite` imposent un niveau, `reduced` coupe les animations.
 */
export const MOTION_PREFS = ["auto", "full", "lite", "reduced"] as const;
export type MotionPref = (typeof MOTION_PREFS)[number];

export const DEFAULT_MOTION_PREF: MotionPref = "auto";
export const MOTION_COOKIE = "kiraku-motion";

export function parseMotionPref(value: string | null | undefined): MotionPref {
  return MOTION_PREFS.includes(value as MotionPref) ? (value as MotionPref) : DEFAULT_MOTION_PREF;
}
