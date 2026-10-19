import "server-only";
import Ably from "ably";
import { ablyEnabled, env } from "./env";

// Client Ably du serveur, partagé par le combat et le chat. Le serveur publie après chaque
// transaction validée ; les navigateurs ne font que s'abonner (jeton limité à leurs canaux).

export const ablyRest = ablyEnabled ? new Ably.Rest({ key: env.ABLY_API_KEY! }) : null;

/** Canal privé d'un joueur : seul son jeton peut s'y abonner. */
export const userChannel = (userId: string) => `kiraku:user:${userId}`;

/** Publie sur le canal d'un joueur sans jamais faire échouer l'action appelante. */
export async function publishToUser(userId: string, event: string, data: unknown) {
  if (!ablyRest) return;
  try {
    await ablyRest.channels.get(userChannel(userId)).publish(event, data);
  } catch (e) {
    console.error(`[temps réel] publication ${event}`, e);
  }
}
