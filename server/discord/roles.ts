import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { env } from "../env";
import { DiscordApiError, discordBotRequest, discordPaused } from "./api";
import { linkedRoleConfigured } from "./roles-config";
import { assertCommunityRole } from "./role-permissions";
import { recordDiscordAlert, resolveDiscordAlert } from "./alert-store";

async function linkedAccount(discordId: string): Promise<boolean> {
  const account = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider: "discord", providerAccountId: discordId } },
    select: { user: { select: { isGuest: true, bannedAt: true, anonymizedAt: true, deletionRequestedAt: true } } },
  });
  return Boolean(account && !account.user.isGuest && !account.user.bannedAt && !account.user.anonymizedAt && !account.user.deletionRequestedAt);
}

export async function queueLinkedDiscordRole(discordId: string): Promise<void> {
  if (!linkedRoleConfigured()) return;
  await prisma.discordRoleSync.upsert({
    where: { guildId_discordId: { guildId: env.DISCORD_GUILD_ID!, discordId } },
    create: { guildId: env.DISCORD_GUILD_ID!, discordId },
    update: { nextAttemptAt: new Date() },
  });
}

/** Toujours relire le compte OAuth : le timestamp de première liaison n'est pas une preuve actuelle. */
export async function syncLinkedDiscordRole(discordId: string): Promise<"linked" | "unlinked" | "absent" | "pending" | "disabled" | "error"> {
  if (!linkedRoleConfigured()) return "disabled";
  const guildId = env.DISCORD_GUILD_ID!;
  const roleId = env.DISCORD_LINKED_ROLE_ID!;
  const now = new Date();
  const leaseId = randomUUID();
  const where = { guildId_discordId: { guildId, discordId } };
  // Échéance lue juste après la prise de la lease. Une remise en tête de file pendant la synchro (ban, demande de
  // suppression, liaison : requeueLinkedDiscordRoleWith, queueLinkedDiscordRole) la change, et le compte relu ici est
  // alors peut-être déjà périmé : la libération garde cette échéance (le cron de la minute repasse) au lieu de la
  // repousser d'un jour. Sans cela, un ban validé pendant la synchro laissait le rôle « vérifié » jusqu'à 24 h.
  let queuedAt: Date | undefined;
  const release = async (delay: number, reset: { attempts?: number } = { attempts: 0 }) => {
    const freed = { ...reset, leaseId: null, leaseUntil: null };
    const pushed = await prisma.discordRoleSync.updateMany({
      where: { guildId, discordId, leaseId, ...(queuedAt && { nextAttemptAt: queuedAt }) },
      data: { ...freed, nextAttemptAt: new Date(Date.now() + delay) },
    });
    if (!pushed.count) await prisma.discordRoleSync.updateMany({ where: { guildId, discordId, leaseId }, data: freed });
  };
  const claim = await prisma.discordRoleSync.updateMany({
    where: { guildId, discordId, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
    data: { leaseId, leaseUntil: new Date(now.getTime() + 60_000), attempts: { increment: 1 } },
  });
  if (!claim.count) return "pending";
  try {
    queuedAt = (await prisma.discordRoleSync.findUniqueOrThrow({ where, select: { nextAttemptAt: true } })).nextAttemptAt;
    const linked = await linkedAccount(discordId);
    let member: { roles: string[]; pending?: boolean };
    try { member = await discordBotRequest(`/guilds/${guildId}/members/${discordId}`); }
    catch (e) {
      if (!(e instanceof DiscordApiError) || e.status !== 404) throw e;
      await release(86_400_000);
      return "absent";
    }
    if (linked && member.pending) {
      await release(3_600_000);
      return "pending";
    }
    if (linked !== member.roles.includes(roleId)) {
      if (linked) await assertCommunityRole(roleId);
      await discordBotRequest(`/guilds/${guildId}/members/${discordId}/roles/${roleId}`, linked ? "PUT" : "DELETE");
    }
    await release(86_400_000);
    await resolveDiscordAlert("linked-role", roleId);
    return linked ? "linked" : "unlinked";
  } catch (e) {
    const job = await prisma.discordRoleSync.findUniqueOrThrow({ where });
    const delay = Math.max(e instanceof DiscordApiError ? e.retryAfterMs : 0, Math.min(3_600_000, 30_000 * 2 ** Math.min(job.attempts, 7)));
    // Tentatives gardées : elles espacent la reprise suivante
    await release(delay, {});
    console.warn(`[discord] rôle de compte lié non synchronisé (${e instanceof DiscordApiError ? e.status : "base"}).`);
    // Un incident pour le rôle, pas un par joueur : une permission cassée touche tout le monde à la fois
    await recordDiscordAlert("linked-role", roleId, e instanceof DiscordApiError ? e.status : undefined);
    return "error";
  }
}

/** Rattrape progressivement les comptes déjà liés, sans copier leurs jetons OAuth. */
export async function syncLinkedDiscordRoles(deadline = Date.now() + 30_000): Promise<{ synced: number; deferred: number }> {
  const result = { synced: 0, deferred: 0 };
  if (!linkedRoleConfigured()) return result;
  const missing = await prisma.$queryRaw<Array<{ discordId: string }>>`
    SELECT a."providerAccountId" AS "discordId" FROM "Account" a JOIN "User" u ON u.id = a."userId"
    WHERE a.provider = 'discord' AND u."isGuest" = false AND u."bannedAt" IS NULL AND u."anonymizedAt" IS NULL
      AND u."deletionRequestedAt" IS NULL AND NOT EXISTS (
        SELECT 1 FROM "DiscordRoleSync" r WHERE r."guildId" = ${env.DISCORD_GUILD_ID!} AND r."discordId" = a."providerAccountId"
      ) ORDER BY a.id LIMIT 50`;
  if (missing.length) await prisma.discordRoleSync.createMany({ data: missing.map(({ discordId }) => ({ guildId: env.DISCORD_GUILD_ID!, discordId })), skipDuplicates: true });
  const jobs = await prisma.discordRoleSync.findMany({
    where: { guildId: env.DISCORD_GUILD_ID, nextAttemptAt: { lte: new Date() }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }] },
    orderBy: { nextAttemptAt: "asc" }, take: 5, select: { discordId: true },
  });
  for (const job of jobs) {
    if (Date.now() + 15_000 > deadline || discordPaused()) break;
    const outcome = await syncLinkedDiscordRole(job.discordId);
    if (outcome === "error" || outcome === "pending") result.deferred++;
    else result.synced++;
  }
  return result;
}
