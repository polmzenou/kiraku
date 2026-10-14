"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Sheet } from "../ui/Sheet";

/**
 * Fiche carte ouverte en feuille au-dessus de la collection (route interceptée) : la liste reste
 * montée derrière, avec ses pages chargées et sa position. Fermer = revenir en arrière.
 */
export function CardSheet({ title, children }: { title: string; children: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  return (
    <Sheet
      open={open}
      wide
      title={title}
      onClose={() => {
        if (!open) return;
        setOpen(false);
        router.back();
      }}
    >
      {children}
    </Sheet>
  );
}
