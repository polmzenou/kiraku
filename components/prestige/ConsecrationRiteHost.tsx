"use client";

import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { FudaCard } from "@/components/fuda/Fuda";

// Rite de consécration (奉納) : chargé seulement après une consécration réussie (ou à l'ouverture de sa feuille)
const ConsecrationRite = dynamic(() => import("./ConsecrationRite").then((mod) => mod.ConsecrationRite), { ssr: false });

export type ConsecrationRiteStart = (rite: { card: FudaCard; username: string }) => void;

const RiteContext = createContext<ConsecrationRiteStart | null>(null);

/**
 * Hôte du rite de consécration, monté à une place que le serveur ne refait pas (layout de /collection, au-dessus de la
 * fiche en page et de la fiche en feuille). La consécration rafraîchit la fiche (refresh() dans l'action) : la ligne de
 * l'exemplaire consacré disparaît avec le bouton qui l'a lancée, le rite ne peut donc pas vivre dans cette ligne.
 *
 * Il se joue dans un <dialog> modal : la fiche en feuille est elle-même un <dialog> de la couche supérieure, qu'aucun
 * z-index ne passe ; ouvert après elle, celui-ci se pose devant, piège le focus et rend la page inerte. Échap le
 * referme (la consécration est déjà faite, le sanctuaire reste à un lien du profil).
 */
export function ConsecrationRiteHost({ children }: { children: ReactNode }) {
  const t = useTranslations("prestige.consecrate.rite");
  const [rite, setRite] = useState<{ card: FudaCard; username: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const start = useCallback<ConsecrationRiteStart>(({ card, username }) => setRite({ card, username }), []);

  // Ouvert dans la phase de mise en page, avant les effets du rite : c'est lui qui prend ensuite le focus
  useLayoutEffect(() => {
    const el = dialog.current;
    if (rite && el && !el.open) el.showModal();
  }, [rite]);

  return (
    <RiteContext value={start}>
      {children}
      {rite && (
        <dialog
          ref={dialog}
          aria-label={t("label")}
          onClose={() => setRite(null)}
          className="m-0 h-full max-h-none w-full max-w-none overflow-hidden border-0 bg-transparent p-0 backdrop:bg-black/80"
        >
          <ConsecrationRite card={rite.card} username={rite.username} />
        </dialog>
      )}
    </RiteContext>
  );
}

/** Lance le rite après une consécration réussie ; null hors de l'hôte (il n'est monté que sous /collection). */
export function useConsecrationRite(): ConsecrationRiteStart | null {
  return useContext(RiteContext);
}
