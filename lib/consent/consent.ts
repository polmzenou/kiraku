import { z } from "zod";
import type { ConsentCategory } from "./registry";

// Choix de consentement aux traceurs, gardé dans le cookie `kiraku.consent` (côté navigateur).
// Règles CNIL : rien de non exempté avant le choix, « Refuser » aussi simple qu'« Accepter »,
// choix redemandé au bout de 6 mois.

export const CONSENT_COOKIE = "kiraku.consent";
export const CONSENT_VERSION = 1;
export const CONSENT_MAX_AGE_DAYS = 182; // ~6 mois
const DAY_MS = 86_400_000;

/** Évènements de fenêtre : ouvrir le panneau, prévenir d'un nouveau choix. */
export const CONSENT_OPEN_EVENT = "kiraku:consent-open";
export const CONSENT_CHANGE_EVENT = "kiraku:consent-change";

export type ConsentState = {
  v: number;
  /** Date du choix, en ms. */
  at: number;
  choices: Partial<Record<ConsentCategory, boolean>>;
};

const stateSchema = z.object({
  v: z.number().int(),
  at: z.number().int().nonnegative(),
  // partialRecord : une catégorie absente = pas encore de choix pour elle
  choices: z.partialRecord(z.enum(["preferences", "measure"]), z.boolean()),
});

export function parseConsent(raw: string | null | undefined): ConsentState | null {
  if (!raw) return null;
  try {
    const parsed = stateSchema.safeParse(JSON.parse(decodeURIComponent(raw)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function serializeConsent(state: ConsentState): string {
  return encodeURIComponent(JSON.stringify(state));
}

export function isExpired(state: ConsentState, now: number): boolean {
  return now - state.at > CONSENT_MAX_AGE_DAYS * DAY_MS;
}

/** Le bandeau s'affiche : un choix est attendu et il manque, a expiré ou ne couvre pas tout. */
export function needsPrompt(state: ConsentState | null, optional: readonly ConsentCategory[], now: number): boolean {
  if (optional.length === 0) return false;
  if (!state || state.v !== CONSENT_VERSION || isExpired(state, now)) return true;
  return optional.some((c) => state.choices[c] === undefined);
}

/** Un traceur de cette catégorie peut-il être déposé ? Le nécessaire, toujours ; le reste, sur accord. */
export function hasConsent(state: ConsentState | null, category: ConsentCategory, now: number): boolean {
  if (category === "necessary") return true;
  if (!state || state.v !== CONSENT_VERSION || isExpired(state, now)) return false;
  return state.choices[category] === true;
}

/** Choix uniforme (« Tout accepter » / « Tout refuser ») ou détaillé (« Personnaliser »). */
export function makeConsent(
  optional: readonly ConsentCategory[],
  choice: boolean | Partial<Record<ConsentCategory, boolean>>,
  now: number,
): ConsentState {
  const choices: ConsentState["choices"] = {};
  for (const c of optional) choices[c] = typeof choice === "boolean" ? choice : choice[c] === true;
  return { v: CONSENT_VERSION, at: now, choices };
}
