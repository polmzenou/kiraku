import type { Action, Side } from "./types";

// Délais du combat dérivés des réglages (GameSetting) : rien en dur à côté du réglage qui le commande.

/**
 * Un joueur en file n'est appariable que s'il a sondé depuis ce délai (secondes) : deux sondages et une marge, jamais
 * moins de 15 s. Suit battle.queuePollSeconds (2 à 60 s) : un seuil fixe de 15 s faisait rater les appariements dès
 * que le sondage dépassait 5 s.
 */
export function queueFreshSeconds(queuePollSeconds: number): number {
  return Math.max(15, 2 * queuePollSeconds + 5);
}

/** Sans nouvelle depuis ce délai (secondes), la place en file est libérée : quatre sondages, jamais moins de 60 s. */
export function queueStaleSeconds(queuePollSeconds: number): number {
  return Math.max(60, 4 * queuePollSeconds);
}

/**
 * Temps ajouté à l'échéance du joueur pour l'animation du tour du bot, joué dans la même requête que sa fin de tour
 * (battle.botTurnGraceMs par coup du bot, fins de tour exceptées), au plus la durée d'un tour. 0 : aucune marge.
 */
export function botTurnGraceMs(
  actions: readonly { side: Side; action: Pick<Action, "type"> }[],
  botSide: Side | null,
  perActionMs: number,
  turnSeconds: number,
): number {
  if (botSide === null || perActionMs <= 0) return 0;
  const moves = actions.filter((a) => a.side === botSide && a.action.type !== "END_TURN" && a.action.type !== "TIMEOUT").length;
  return Math.min(moves * perActionMs, turnSeconds * 1_000);
}
