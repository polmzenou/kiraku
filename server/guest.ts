import "server-only";
import { randomBytes } from "node:crypto";
import { guestUsername } from "@/lib/username";
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
    const username = await availableUsername(tx, guestUsername(randomBytes(3)));
    const user = await createPlayer(tx, { username, isGuest: true }, start);
    return createSessionRow(tx, user.id);
  });
}
