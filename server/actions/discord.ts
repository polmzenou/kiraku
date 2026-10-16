"use server";

import { prisma } from "../db";
import { rateLimit } from "../ratelimit";
import { getCurrentUser } from "../user";

// Modal « Rejoins notre Discord » : un clic sur « Rejoindre » le fait disparaître pour ce joueur.
// Aucune entrée client : le joueur est celui de la session, l'écriture est idempotente.

export async function joinDiscordAction(): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  if (!(await rateLimit(`discord-join:${user.id}`, { limit: 5, windowSeconds: 3600 })).success) return { ok: false };
  await prisma.user.updateMany({ where: { id: user.id, discordJoinedAt: null }, data: { discordJoinedAt: new Date() } });
  return { ok: true };
}
