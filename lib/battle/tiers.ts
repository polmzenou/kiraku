// Rangs du classé tels que le plateau les affiche (couleur du liseré, de la ligne de front et du
// médaillon). Le calcul du rang à partir des PC arrive avec le classé (étape 9b).

export const BOARD_TIERS = ["BRONZE", "SILVER", "GOLD", "EMERALD", "ELITE", "CHAMPION", "GRAND_CHAMPION"] as const;
export type BoardTier = (typeof BOARD_TIERS)[number];

export function parseBoardTier(raw: unknown): BoardTier | null {
  return typeof raw === "string" && (BOARD_TIERS as readonly string[]).includes(raw) ? (raw as BoardTier) : null;
}
