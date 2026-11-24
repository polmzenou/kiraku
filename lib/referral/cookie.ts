import { parseInviteCode } from "./codes";

// Cookie du lien d'invitation (parrainage) : posé par proxy.ts quand un lien porte un code (/i/CODE ou ?ref=CODE sur
// n'importe quelle page partagée), lu à l'inscription pour rattacher le filleul. Il ne contient que le code, jamais un
// id ; seul un contrôle de format est fait ici, la base décide à l'inscription. Pur : utilisé par le proxy et le serveur.

export const REFERRAL_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

export function referralCookieName(production: boolean): string {
  return production ? "__Secure-kiraku.ref" : "kiraku.ref";
}

export function referralCookieOptions(production: boolean) {
  return { httpOnly: true, sameSite: "lax" as const, path: "/", secure: production, maxAge: REFERRAL_COOKIE_MAX_AGE };
}

function decode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/**
 * Code d'invitation porté par une adresse : le lien d'invitation /i/CODE (avec ou sans préfixe de langue), sinon
 * ?ref=CODE sur une page partagée (tirage, profil, vitrine…). Null si aucun code bien formé.
 */
export function inviteCodeFromUrl(pathname: string, search: URLSearchParams, locales: readonly string[]): string | null {
  const parts = pathname.split("/").filter(Boolean);
  const rest = parts.length > 0 && locales.includes(parts[0]) ? parts.slice(1) : parts;
  if (rest.length === 2 && rest[0] === "i") {
    const raw = decode(rest[1]);
    return raw === null ? null : (parseInviteCode(raw)?.code ?? null);
  }
  const ref = search.get("ref");
  return ref ? (parseInviteCode(ref)?.code ?? null) : null;
}
