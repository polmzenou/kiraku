// Rôle Discord « Joueur Kiraku vérifié » : remis en tête de file quand l'état du compte change (ban, levée du ban,
// demande de suppression ou son annulation, anonymisation). Le cron de la minute (server/discord/roles.ts) relit alors
// le compte et retire ou rend le rôle, au lieu d'attendre le contrôle quotidien. Le client est celui de la transaction
// de l'appelant (pas de server/db.ts ici), appelé avant que le lien Discord ne soit effacé.
import type { Tx } from "../social/lock";

export async function requeueLinkedDiscordRoleWith(tx: Tx, userId: string, now: Date): Promise<void> {
  const accounts = await tx.account.findMany({ where: { userId, provider: "discord" }, select: { providerAccountId: true } });
  if (accounts.length === 0) return;
  // Sans ligne de file, le rôle n'a jamais été attribué par le bot : rien à retirer
  await tx.discordRoleSync.updateMany({ where: { discordId: { in: accounts.map((a) => a.providerAccountId) } }, data: { nextAttemptAt: now } });
}
