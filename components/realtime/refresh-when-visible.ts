"use client";

/**
 * Lance `refresh` (un router.refresh(), soit un rendu serveur complet) tout de suite si l'onglet est
 * visible, sinon à son retour : un onglet oublié ne refait pas la page pour personne.
 * Renvoie le nettoyage de l'écouteur.
 */
export function refreshWhenVisible(refresh: () => void): () => void {
  if (document.visibilityState === "visible") {
    refresh();
    return () => {};
  }
  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    document.removeEventListener("visibilitychange", onVisible);
    refresh();
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => document.removeEventListener("visibilitychange", onVisible);
}
