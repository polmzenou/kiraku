// Content-Security-Policy stricte avec nonce (section « Sécurité applicative » du plan).

export const IMAGE_HOSTS = ["https://s4.anilist.co", "https://cdn.discordapp.com"] as const;

export function buildCsp(nonce: string, isDev: boolean): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    // styles inline de next/font et des animations (attributs style)
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...IMAGE_HOSTS],
    "font-src": ["'self'"],
    "connect-src": ["'self'"],
    // service worker du Web Push (public/sw.js)
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "form-action": ["'self'", "https://discord.com"],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
  };
  const parts = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (!isDev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
