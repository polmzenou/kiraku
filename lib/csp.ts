// Content-Security-Policy stricte avec nonce (section « Sécurité applicative » du plan).

export const IMAGE_HOSTS = ["https://s4.anilist.co", "https://cdn.discordapp.com"] as const;

export function buildCsp(nonce: string, isDev: boolean): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", `'nonce-${nonce}'`],
    "style-src-elem": ["'self'", `'nonce-${nonce}'`],
    // Motion et les composants utilisent des attributs style ; les balises restent protégées.
    "style-src-attr": ["'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...IMAGE_HOSTS],
    "font-src": ["'self'"],
    // Ably : temps réel du combat (WebSocket, et repli HTTP vers ses hôtes de secours)
    "connect-src": ["'self'", "wss://*.ably.io", "https://*.ably.io", "https://*.ably-realtime.com", "wss://*.ably-realtime.com"],
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
