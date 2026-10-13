import { notFound } from "next/navigation";

// Toute route localisée inconnue affiche app/[locale]/not-found.tsx
export default function CatchAll() {
  notFound();
}
