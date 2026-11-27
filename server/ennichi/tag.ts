// Vue publique de l'Ennichi (server/ennichi/queries.ts), relue tout de suite après un réglage ou le tirage. Module sans
// dépendance : les actions de l'admin l'importent sans charger les lectures de la fête.

// Étiquette passée à updateTag par ces actions : la page de l'action est rendue de nouveau avec sa réponse.
export const ENNICHI_TAG = "ennichi";

// Version de la vue gardée en mémoire (lib/ennichi/view-memo.ts) : une nouvelle version la fait relire au prochain
// affichage, sans attendre la minute suivante.
let viewVersion = 0;

/** À appeler avec updateTag(ENNICHI_TAG) : réglages de la fête enregistrés, tirage fait. */
export function forgetEnnichiView(): void {
  viewVersion++;
}

export function ennichiViewVersion(): number {
  return viewVersion;
}
