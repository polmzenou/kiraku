export const MOTION_PREFS = ["full", "reduced"] as const;
export type MotionPref = (typeof MOTION_PREFS)[number];

export const DEFAULT_MOTION_PREF: MotionPref = "full";
export const MOTION_COOKIE = "kiraku-motion";

export function parseMotionPref(value: string | null | undefined): MotionPref {
  return MOTION_PREFS.includes(value as MotionPref) ? (value as MotionPref) : DEFAULT_MOTION_PREF;
}
