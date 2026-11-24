// Code du parrain sur les liens que partage un joueur (tirage, profil, vitrine, table de pile ou face, salle de combat,
// Wrapped) : l'ami qui suit le lien garde le code sur son appareil (proxy.ts) et devient filleul s'il s'inscrit. Pur.

/** Code à mettre dans les liens partagés : le code perso s'il en a un, sinon le code standard ; rien pour un invité. */
export function shareCodeOf(user: { isGuest: boolean; referralCode: string; vanityCode: string | null } | null | undefined): string | null {
  if (!user || user.isGuest) return null;
  return user.vanityCode ?? user.referralCode;
}

/** Le lien avec `?ref=CODE` (remplace un code déjà présent) ; inchangé sans code ou si le lien est illisible. */
export function withShareCode(url: string, code: string | null | undefined): string {
  if (!code) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("ref", code);
    return parsed.href;
  } catch {
    return url;
  }
}
