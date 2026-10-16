import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { buildCsp, generateNonce } from "./lib/csp";

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
  return response;
}

export const config = {
  matcher: [
    {
      // tout sauf les routes API, les fichiers internes de Next et les fichiers avec extension
      source: "/((?!api|_next|_vercel|.*\\..*).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
