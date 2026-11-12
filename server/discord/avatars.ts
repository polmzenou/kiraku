import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { discordAvatarUrl, isDiscordId, type DiscordUserAvatar } from "@/lib/discord/avatar";
import { prisma } from "../db";
import { env } from "../env";
import { getSetting } from "../settings";
import { DiscordApiError, discordBotRequest } from "./api";

// Avatars Discord des joueurs liés, relus par le bot sans que le joueur se reconnecte. Léger : quelques
// joueurs par passage du cron Discord (une fois par minute), seulement ceux qui jouent encore, chacun au
// plus une fois par `discord.avatarSyncHours`. User.image n'est réécrit que si l'avatar a changé.

export type AvatarSyncResult = { checked: number; updated: number };
type Fetch = (discordId: string) => Promise<DiscordUserAvatar>;
type Db = Pick<PrismaClient, "account" | "user">;

/** Lecture et écriture, testables avec un faux client et un faux Discord. */
export async function syncAvatarsWith(
  db: Db,
  fetchUser: Fetch,
  opts: { hours: number; activeDays: number; batch: number; deadline: number; now: Date },
): Promise<AvatarSyncResult> {
  const { hours, activeDays, batch, deadline, now } = opts;
  if (hours <= 0 || batch <= 0) return { checked: 0, updated: 0 };
  const due = await db.account.findMany({
    where: {
      provider: "discord",
      user: {
        anonymizedAt: null,
        lastSeenAt: { gt: new Date(now.getTime() - activeDays * 86_400_000) },
        OR: [{ avatarCheckedAt: null }, { avatarCheckedAt: { lt: new Date(now.getTime() - hours * 3_600_000) } }],
      },
    },
    orderBy: { user: { avatarCheckedAt: { sort: "asc", nulls: "first" } } },
    take: batch,
    select: { providerAccountId: true, user: { select: { id: true, image: true } } },
  });

  let checked = 0, updated = 0;
  for (const { providerAccountId: discordId, user } of due) {
    if (Date.now() > deadline) break;
    let image: string | null = null;
    if (isDiscordId(discordId)) {
      try {
        image = discordAvatarUrl(await fetchUser(discordId));
      } catch (error) {
        // Compte Discord supprimé : rien à relire, on le note relu. Limite atteinte ou panne : on s'arrête là.
        if (!(error instanceof DiscordApiError && error.status === 404)) break;
      }
    }
    const changed = image !== null && image !== user.image;
    await db.user.update({ where: { id: user.id }, data: { avatarCheckedAt: now, ...(changed && { image }) } });
    checked++;
    if (changed) updated++;
  }
  return { checked, updated };
}

/** Passage du cron Discord : sans bot configuré, rien n'est fait. */
export async function syncDiscordAvatars(deadline: number, now = new Date()): Promise<AvatarSyncResult> {
  if (!env.DISCORD_BOT_TOKEN) return { checked: 0, updated: 0 };
  const [hours, activeDays, batch] = await Promise.all([
    getSetting("discord.avatarSyncHours"),
    getSetting("discord.avatarSyncActiveDays"),
    getSetting("discord.avatarSyncBatch"),
  ]);
  return syncAvatarsWith(prisma, (id) => discordBotRequest<DiscordUserAvatar>(`/users/${id}`), { hours, activeDays, batch, deadline, now });
}
