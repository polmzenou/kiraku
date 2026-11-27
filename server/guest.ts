import "server-only";
import { prisma } from "./db";
import { availableUsername, createPlayer, startingValues } from "./players";
import { createSessionRow } from "./session";

/**
 * Crée un joueur invité et une session Auth.js (stratégie base de données)
 * à son nom. L'appelant pose le cookie avec setSessionCookie.
 */
export async function createGuestSession() {
  const start = await startingValues();
  return prisma.$transaction(async (tx) => {
    // Sans nom de base : un pseudo d'invité tiré au hasard (guest-XXXXXX), retiré en cas de collision
    const username = await availableUsername(tx, null);
    const user = await createPlayer(tx, { username, isGuest: true }, start);
    return { ...(await createSessionRow(tx, user.id)), userId: user.id };
  });
}
