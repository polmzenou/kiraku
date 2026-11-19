import type { ReactNode } from "react";

/**
 * Bloc de l'admin en lecture seule pour le DEV : un <fieldset disabled> désactive d'un coup tous les champs et
 * boutons qu'il contient (les liens restent actifs). Ce n'est qu'un reflet : chaque Server Action d'écriture
 * revérifie le rôle ADMIN.
 */
export function ReadOnly({ when, children }: { when: boolean; children: ReactNode }) {
  if (!when) return children;
  return (
    <fieldset disabled className="m-0 min-w-0 border-0 p-0 opacity-80">
      {children}
    </fieldset>
  );
}
