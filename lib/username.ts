export const USERNAME_REGEX = /^[A-Za-z0-9_-]{3,20}$/;

export const GUEST_PREFIX = "guest-";
const GUEST_CODE_LENGTH = 6;

/** Pseudo stocké d'un invité, ex. « guest-3A046F » ; affiché « Invité-3A046F » via t(). */
export function guestUsername(randomBytes: Uint8Array): string {
  const hex = Array.from(randomBytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return GUEST_PREFIX + hex.slice(0, GUEST_CODE_LENGTH).toUpperCase();
}

export function guestCode(username: string): string | null {
  return username.startsWith(GUEST_PREFIX) ? username.slice(GUEST_PREFIX.length) : null;
}

/** Pseudo dérivé d'un nom Discord : caractères autorisés seulement, sinon null. */
export function sanitizeUsername(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 20);
  return USERNAME_REGEX.test(cleaned) ? cleaned : null;
}
