/** Limite une cible de redirection à un chemin interne au site. */
export function safeRedirect(url: string, baseUrl: string): string {
  if (url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\")) {
    return new URL(url, baseUrl).toString();
  }
  try {
    const target = new URL(url);
    if (target.origin === new URL(baseUrl).origin) return target.toString();
  } catch {
    // URL invalide : on retombe sur l'accueil
  }
  return baseUrl;
}
