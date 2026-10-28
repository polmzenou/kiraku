import "server-only";
import { ablyRest as rest, publishSafely, publishToUser, userChannel } from "../realtime";
import type { BattleUpdate } from "./battle-core";

// Temps réel du combat (Ably). Le serveur publie après chaque transaction validée, jamais dedans ;
// les navigateurs ne font que s'abonner, avec un jeton limité à leurs propres canaux. Sans clé
// (dev), rien ne part et le plateau sonde la partie : le jeu reste jouable, juste moins vif.

export const battleChannel = (battleId: string) => `kiraku:battle:${battleId}`;
export { userChannel };

/** Message diffusé aux deux joueurs : tout l'état est public, rien n'est caché. */
export type BattleMessage = Omit<BattleUpdate, "turnEndsAt"> & { turnEndsAt: string | null };

export function toMessage(u: BattleUpdate): BattleMessage {
  return { ...u, turnEndsAt: u.turnEndsAt?.toISOString() ?? null };
}

/** Publie sans jamais faire échouer l'action : en cas de panne, les clients se resynchronisent. */
export async function publishBattle(update: BattleUpdate) {
  if (!rest) return;
  const ably = rest;
  await publishSafely("combat", () => ably.channels.get(battleChannel(update.battleId)).publish("update", toMessage(update)));
}

/** Prévient un joueur en file qu'un adversaire l'a trouvé. */
export async function publishMatched(userId: string, battleId: string) {
  await publishToUser(userId, "matched", { battleId });
}

/**
 * Jeton d'abonnement : son propre canal, plus celui d'une partie dont le joueur est participant.
 * null si le temps réel est coupé ou si la signature échoue : le navigateur reste alors sur le sondage.
 */
export async function tokenRequest(userId: string, battleId: string | null) {
  if (!rest) return null;
  const capability: Record<string, ["subscribe"]> = { [userChannel(userId)]: ["subscribe"] };
  if (battleId) capability[battleChannel(battleId)] = ["subscribe"];
  try {
    return await rest.auth.createTokenRequest({ clientId: userId, capability: JSON.stringify(capability), ttl: 60 * 60 * 1000 });
  } catch (e) {
    console.error("[temps réel] jeton", e instanceof Error ? e.message : e);
    return null;
  }
}
