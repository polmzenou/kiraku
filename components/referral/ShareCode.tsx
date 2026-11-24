"use client";

import { createContext, useContext, type ReactNode } from "react";

// Code de parrain du joueur connecté, posé une fois par le layout : les boutons de partage (tirage, profil, vitrine,
// pile ou face, salle de combat, Wrapped) l'ajoutent à leur lien (?ref=CODE, lib/referral/share.ts).

const ShareCodeContext = createContext<string | null>(null);

export function ShareCodeProvider({ code, children }: { code: string | null; children: ReactNode }) {
  return <ShareCodeContext.Provider value={code}>{children}</ShareCodeContext.Provider>;
}

/** Code à mettre dans les liens partagés par le joueur connecté ; null pour un invité ou un visiteur. */
export function useShareCode(): string | null {
  return useContext(ShareCodeContext);
}
