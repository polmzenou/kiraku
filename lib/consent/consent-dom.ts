import {
  CONSENT_CHANGE_EVENT,
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_DAYS,
  CONSENT_OPEN_EVENT,
  parseConsent,
  serializeConsent,
  type ConsentState,
} from "./consent";

// Côté navigateur : lecture et écriture du cookie de consentement, évènements de la fenêtre.

export function readConsent(): ConsentState | null {
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${CONSENT_COOKIE}=`));
  return parseConsent(match?.slice(CONSENT_COOKIE.length + 1));
}

export function writeConsent(state: ConsentState) {
  const secure = location.protocol === "https:" ? "; secure" : "";
  // Cookie de consentement : strictement nécessaire (il mémorise le choix lui-même)
  document.cookie = `${CONSENT_COOKIE}=${serializeConsent(state)}; path=/; max-age=${CONSENT_MAX_AGE_DAYS * 86_400}; samesite=lax${secure}`;
  window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT));
}

/** Rouvre le panneau de choix (pied de page, page Cookies, Mes données). */
export function openConsentPanel() {
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
}
