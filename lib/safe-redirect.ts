/**
 * Limite une cible de redirection au site lui-même. L'adresse est d'abord résolue comme le ferait le navigateur,
 * puis son origine comparée : « /\t/evil.example » (tabulation ou saut de ligne retirés à la lecture) devient
 * « //evil.example » et sort du site, un simple contrôle du préfixe ne le voyait pas.
 */
export function safeRedirect(url: string, baseUrl: string): string {
  try {
    const base = new URL(baseUrl);
    const target = new URL(url, base);
    if (target.origin === base.origin) return target.toString();
  } catch {
    // URL invalide : on retombe sur l'accueil
  }
  return baseUrl;
}
