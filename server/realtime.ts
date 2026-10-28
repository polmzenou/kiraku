import "server-only";
import Ably from "ably";
import { ablyEnabled, env } from "./env";

// Client Ably du serveur, partagé par le combat et le chat. Le serveur publie après chaque
// transaction validée ; les navigateurs ne font que s'abonner (jeton limité à leurs canaux).

export const ablyRest = ablyEnabled ? new Ably.Rest({ key: env.ABLY_API_KEY! }) : null;

/** Canal privé d'un joueur : seul son jeton peut s'y abonner. */
export const userChannel = (userId: string) => `kiraku:user:${userId}`;

// Au-delà, la publication est abandonnée : un Ably lent (quota, panne) ne retient jamais l'action ;
// les clients se rattrapent par leur sondage de secours.
const PUBLISH_TIMEOUT_MS = 2_000;

/** Attend une publication au plus PUBLISH_TIMEOUT_MS ; ne lève jamais (journalise). */
export async function publishSafely(label: string, publish: () => Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      publish(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), PUBLISH_TIMEOUT_MS);
      }),
    ]);
  } catch (e) {
    console.error(`[temps réel] publication ${label}`, e instanceof Error ? e.message : e);
  } finally {
    clearTimeout(timer);
  }
}

/** Publie sur le canal d'un joueur sans jamais faire échouer l'action appelante. */
export async function publishToUser(userId: string, event: string, data: unknown) {
  if (!ablyRest) return;
  const rest = ablyRest;
  await publishSafely(event, () => rest.channels.get(userChannel(userId)).publish(event, data));
}
