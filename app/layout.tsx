import type { ReactNode } from "react";
import "./globals.css";

// Le vrai layout racine (<html>) est app/[locale]/layout.tsx ; celui-ci
// n'existe que pour permettre app/not-found.tsx hors des routes localisées.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
