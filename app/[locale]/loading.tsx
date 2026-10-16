import { PageSkeleton } from "@/components/PageSkeleton";

// Chargement générique de toutes les pages sans squelette propre (accueil compris)
export default function LocaleLoading() {
  return <PageSkeleton variant="list" />;
}
