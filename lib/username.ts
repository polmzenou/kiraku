import { ANONYMIZED_PREFIX } from "./account/deletion";

export const USERNAME_REGEX = /^[A-Za-z0-9_-]{3,20}$/;

export const GUEST_PREFIX = "guest-";

/**
 * Pseudo choisi par un joueur qui imiterait un pseudo généré (invité, compte supprimé), casse ignorée : il se ferait
 * passer pour un compte supprimé et échapperait au rapprochement des pseudos de l'anti-triche (lib/anticheat/score.ts).
 */
export function hasReservedPrefix(username: string): boolean {
  const name = username.toLowerCase();
  return name.startsWith(GUEST_PREFIX) || name.startsWith(ANONYMIZED_PREFIX);
}
const GUEST_CODE_LENGTH = 6;

/** Pseudo stocké d'un invité, ex. « guest-3A046F » ; affiché « Invité-3A046F » via t(). */
export function guestUsername(randomBytes: Uint8Array): string {
  const hex = Array.from(randomBytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return GUEST_PREFIX + hex.slice(0, GUEST_CODE_LENGTH).toUpperCase();
}

export function guestCode(username: string): string | null {
  return username.startsWith(GUEST_PREFIX) ? username.slice(GUEST_PREFIX.length) : null;
}

/**
 * Nom affiché d'un joueur : « Invité-3A046F » (libellé traduit) pour un invité, son pseudo sinon. Rangé ici plutôt
 * qu'avec l'en-tête du profil : le chat de l'en-tête, présent sur toutes les pages, l'importait de ProfileHeader et
 * embarquait avec lui le catalogue des succès (9 Ko) dans le JavaScript de chaque page.
 */
export function displayName(username: string, isGuest: boolean, guestLabel: (code: string) => string) {
  const code = guestCode(username);
  return isGuest && code ? guestLabel(code) : username;
}

/** Pseudo dérivé d'un nom Discord : caractères autorisés seulement, jamais un préfixe réservé, sinon null. */
export function sanitizeUsername(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 20);
  return USERNAME_REGEX.test(cleaned) && !hasReservedPrefix(cleaned) ? cleaned : null;
}
