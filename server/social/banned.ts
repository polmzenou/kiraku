import "server-only";
import { prisma } from "../db";

/**
 * Pseudos bannis parmi ceux-ci. Les classements sont gardés en cache quelques minutes : un joueur banni depuis
 * le dernier calcul en sort tout de suite, sans attendre que le cache expire (les bans de l'admin le vident aussi).
 */
export async function bannedUsernames(usernames: readonly string[]): Promise<Set<string>> {
  if (usernames.length === 0) return new Set();
  const rows = await prisma.user.findMany({ where: { username: { in: [...new Set(usernames)] }, bannedAt: { not: null } }, select: { username: true } });
  return new Set(rows.map((r) => r.username));
}

/** Retire des lignes les joueurs bannis depuis leur mise en cache. */
export async function withoutBanned<T extends { username: string }>(rows: readonly T[]): Promise<T[]> {
  const banned = await bannedUsernames(rows.map((r) => r.username));
  return banned.size === 0 ? [...rows] : rows.filter((r) => !banned.has(r.username));
}
