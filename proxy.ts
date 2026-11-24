import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { buildCsp, generateNonce } from "./lib/csp";
import { inviteCodeFromUrl, referralCookieName, referralCookieOptions } from "./lib/referral/cookie";

const handleI18nRouting = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  const nonce = generateNonce();
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development");

  // Next lit la CSP de la requête pour appliquer le nonce à ses scripts ;
  // next-intl recopie ces en-têtes dans sa réécriture.
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", csp);
  // Chemin demandé, pour l'écran d'acceptation des CGU (les pages légales restent lisibles)
  request.headers.set("x-kiraku-path", request.nextUrl.pathname);

  const response = handleI18nRouting(request);
  response.headers.set("Content-Security-Policy", csp);
  // Lien d'invitation (/i/CODE) ou page partagée avec ?ref=CODE : le code suit sur l'appareil jusqu'à l'inscription.
  // Simple contrôle de format ; le dernier lien suivi l'emporte. Rien n'est écrit en base ici.
  const code = inviteCodeFromUrl(request.nextUrl.pathname, request.nextUrl.searchParams, routing.locales);
  if (code) {
    const production = process.env.NODE_ENV === "production";
    response.cookies.set(referralCookieName(production), code, referralCookieOptions(production));
  }
  return response;
}

export const config = {
  matcher: [
    {
      // tout sauf les routes API, les fichiers internes de Next et les fichiers avec extension
      source: "/((?!api|_next|_vercel|.*\\..*).*)",
    },
  ],
};
