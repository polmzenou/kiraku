"use client";

import { createContext, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { DEFAULT_SPOILER_PREFS, isSpoilerBlurred, spoilerRevealCss, type SpoilerPrefs } from "@/lib/spoiler";

type Value = {
  prefs: SpoilerPrefs;
  /** Applique tout de suite un réglage (flou, feuille des univers en clair) ; l'enregistrement passe par une action. */
  setPrefs: Dispatch<SetStateAction<SpoilerPrefs>>;
  /** Un compte peut enregistrer son réglage ; sans compte, tout reste flouté et les contrôles sont masqués. */
  canSave: boolean;
};

const SpoilerPreferenceContext = createContext<Value>({ prefs: DEFAULT_SPOILER_PREFS, setPrefs: () => {}, canSave: false });

/**
 * Réglage spoiler du compte, lu par le layout (pas de flash au chargement) : `data-spoiler="hide"` sur <html> active
 * les règles de flou, et la feuille générée remet en clair les univers choisis. Changé sans recharger la page.
 * La balise <style> porte le nonce de la CSP (style-src-elem) et reste montée même vide : un changement de réglage
 * ne modifie que son texte, que le navigateur accepte au nom du nonce déjà vérifié.
 */
export function SpoilerPreferenceProvider({ initial, canSave, nonce, children }: { initial: SpoilerPrefs; canSave: boolean; nonce?: string; children: ReactNode }) {
  const [prefs, setPrefs] = useState(initial);
  useEffect(() => {
    const root = document.documentElement;
    if (prefs.blur) root.dataset.spoiler = "hide";
    else delete root.dataset.spoiler;
  }, [prefs.blur]);
  const css = spoilerRevealCss(prefs.shown);
  return (
    <SpoilerPreferenceContext.Provider value={{ prefs, setPrefs, canSave }}>
      {/* Clés validées (minuscules et chiffres) : React n'échappe que « </style » dans ce texte */}
      <style nonce={nonce}>{css}</style>
      {children}
    </SpoilerPreferenceContext.Provider>
  );
}

export const useSpoilerPreference = () => useContext(SpoilerPreferenceContext);

/** L'illustration de cette carte spoil est-elle floutée pour le joueur ? */
export function useSpoilerBlurred(spoiler: boolean, key: string | null | undefined): boolean {
  const { prefs } = useContext(SpoilerPreferenceContext);
  return spoiler && isSpoilerBlurred(prefs, key);
}
