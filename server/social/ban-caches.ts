import "server-only";
import { updateTag } from "next/cache";
import { LEADERBOARD_TAG } from "../collection/leaderboard";
import { RANKED_TAG } from "../ranked/queries";

/**
 * Après un ban (ou sa levée) depuis l'admin : les classements en cache se recalculent tout de suite, le joueur
 * en sort (ou y revient) sans attendre l'expiration. À appeler depuis une Server Action.
 */
export function refreshLeaderboardsAfterBan() {
  updateTag(LEADERBOARD_TAG);
  updateTag(RANKED_TAG);
}
