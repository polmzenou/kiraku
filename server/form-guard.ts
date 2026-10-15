import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

// Anti-robots sans CAPTCHA pour les formulaires publics (inscription) :
// - un jeton horodaté signé (HMAC avec AUTH_SECRET), posé par la page : un robot qui poste
//   directement sur l'action n'en a pas, un humain met plus de FORM_MIN_MS à remplir ;
// - un champ piège invisible (HONEYPOT_FIELD) que seuls les robots remplissent.
// Le rate limit par IP et par e-mail reste la vraie barrière ; ceci écarte le spam bon marché.

export const HONEYPOT_FIELD = "website";
export const FORM_MIN_MS = 2_500;
const FORM_MAX_MS = 2 * 3_600_000;

function sign(issuedAt: string, purpose: string): string {
  return createHmac("sha256", env.AUTH_SECRET).update(`form:${purpose}:${issuedAt}`).digest("base64url");
}

/** Jeton à poser dans un champ caché du formulaire, rendu par le serveur. */
export function issueFormToken(purpose: string, now: number = Date.now()): string {
  const issuedAt = String(now);
  return `${issuedAt}.${sign(issuedAt, purpose)}`;
}

export type FormGuardResult = "ok" | "tooFast" | "expired" | "invalid";

/** Vérifie le jeton et le champ piège d'un formulaire reçu. */
export function checkFormGuard(formData: FormData, purpose: string, now: number = Date.now()): FormGuardResult {
  const trap = formData.get(HONEYPOT_FIELD);
  if (typeof trap === "string" && trap.length > 0) return "invalid";

  const token = formData.get("formToken");
  if (typeof token !== "string" || token.length > 100) return "invalid";
  const [issuedAt, mac] = token.split(".");
  if (!issuedAt || !mac || !/^\d{13}$/.test(issuedAt)) return "invalid";
  const expected = Buffer.from(sign(issuedAt, purpose));
  const given = Buffer.from(mac);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return "invalid";

  const age = now - Number(issuedAt);
  if (age < FORM_MIN_MS) return "tooFast";
  if (age > FORM_MAX_MS) return "expired";
  return "ok";
}
