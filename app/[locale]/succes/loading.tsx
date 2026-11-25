import { PageSkeleton } from "@/components/PageSkeleton";

// Succès : la page relit l'historique du joueur avant d'afficher la grille
export default function AchievementsLoading() {
  return <PageSkeleton variant="grid" />;
}
