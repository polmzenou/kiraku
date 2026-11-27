// Création du compte invité, un onglet à la fois (Web Locks du navigateur). Deux onglets ouverts ensemble à la
// première visite (session restaurée, liens ouverts d'un coup) appelaient chacun ensureGuest sans cookie : deux invités
// naissaient, le dernier cookie posé gagnait et l'autre compte restait orphelin, avec les premiers tirages faits dans
// son onglet. Sous ce verrou, le second onglet attend la réponse du premier, envoie le cookie qu'elle a posé, et
// ensureGuest se contente de re-rendre sa page. Sans Web Locks (contexte non sécurisé, vieux navigateur) : comme avant.

export const GUEST_LOCK = "kiraku:guest";

export async function oneTabAtATime<T>(task: () => Promise<T>, locks: LockManager | null | undefined = globalThis.navigator?.locks): Promise<T> {
  return locks ? locks.request(GUEST_LOCK, () => task()) : task();
}
