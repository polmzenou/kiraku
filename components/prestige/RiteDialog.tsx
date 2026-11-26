"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/**
 * Cadre modal des rites (renaissance, cinématique, consécration) : un <dialog> ouvert par showModal() dès son montage.
 * Le focus reste dans le rite, le reste de la page devient inerte et ne défile plus (app/globals.css), et le rite passe
 * devant une feuille déjà ouverte (elle aussi dans la couche supérieure). Échap le referme : `onClose`.
 *
 * Il s'ouvre dans la phase de mise en page, avant les effets du rite, qui donnent ensuite le focus à « Passer »
 * (autoFocus agirait avant l'ouverture, et le dialogue retomberait sur le lien de fin, encore invisible).
 */
export function RiteDialog({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-label={label}
      onClose={onClose}
      className="m-0 h-full max-h-none w-full max-w-none overflow-hidden border-0 bg-transparent p-0 backdrop:bg-black/80"
    >
      {children}
    </dialog>
  );
}
