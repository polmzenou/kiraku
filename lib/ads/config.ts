// Publicité Google AdSense. L'identifiant éditeur est public (il figure dans ads.txt et la page).
// Le script ne se charge que si ADS_ENABLED=1 : la balise meta, elle, reste toujours présente
// pour que Google puisse valider le site.

export const ADSENSE_CLIENT = "ca-pub-9045189871426473";
export const ADSENSE_SCRIPT_URL = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;

/** Lu côté serveur (layout) et dans proxy.ts (CSP). */
export function adsEnabled(): boolean {
  return process.env.ADS_ENABLED === "1";
}

// Domaines Google nécessaires aux annonces et au message de consentement (Funding Choices).
// Le script lui-même passe par le nonce + 'strict-dynamic' : inutile de l'autoriser par hôte.
export const ADS_CSP = {
  "frame-src": [
    "https://googleads.g.doubleclick.net",
    "https://tpc.googlesyndication.com",
    "https://*.googlesyndication.com",
    "https://www.google.com",
    "https://fundingchoicesmessages.google.com",
    "https://*.adtrafficquality.google",
  ],
  "img-src": [
    "https://*.googlesyndication.com",
    "https://*.g.doubleclick.net",
    "https://www.google.com",
    "https://www.google.fr",
    "https://*.gstatic.com",
    "https://*.adtrafficquality.google",
  ],
  "connect-src": [
    "https://*.googlesyndication.com",
    "https://*.g.doubleclick.net",
    "https://www.google.com",
    "https://fundingchoicesmessages.google.com",
    "https://*.adtrafficquality.google",
  ],
} as const;
