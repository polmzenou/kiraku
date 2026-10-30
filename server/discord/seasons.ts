import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { seasonSnapshotSchema, type SeasonSnapshot } from "@/lib/discord/season";
import type { DiscordMessageBody } from "@/lib/discord/community";
import { prisma } from "../db";
import { appUrl, env } from "../env";
import { getSetting } from "../settings";
import { getRankedRules } from "../ranked/queries";
import { rollSeasonWith } from "../ranked/ranked-core";
import { publishDiscordPost } from "./posts";
import { seasonImage } from "./season-image";
import { recordDiscordAlert, resolveDiscordAlert } from "./alert-store";

export async function rankedDiscordEnabled(): Promise<boolean> {
  return Boolean(env.DISCORD_BOT_TOKEN && env.DISCORD_GUILD_ID && env.DISCORD_RANKED_CHANNEL_ID && await getSetting("discord.rankedEnabled"));
}

export function seasonMessage(snapshot: SeasonSnapshot): DiscordMessageBody {
  const url = new URL("/classement", appUrl());
  url.searchParams.set("vue", "classe");
  url.searchParams.set("bilan", String(snapshot.number));
  return {
    content: `🏆 **Fin de la saison ${snapshot.number} !**\nRetrouvez le classement public final ci-dessous.\n\n🔥 **Début de la saison ${snapshot.nextNumber} ! Bon courage à tous !**`,
    embeds: [{ title: `Classement final · saison ${snapshot.number}`, url: url.href, color: 0xd9b556, image: { url: `attachment://kiraku-saison-${snapshot.number}.png` } }],
    components: [{ type: 1, components: [{ type: 2, style: 5, label: "Voir le classement actuel", url: url.href }] }],
    allowed_mentions: { parse: [] },
  };
}

/** Le cron minute clôt aussi la saison : aucune visite du jeu n'est nécessaire pour l'annonce. */
export async function syncDiscordSeasons(deadline = Date.now() + 25_000): Promise<{ published: number; failed: number }> {
  const result = { published: 0, failed: 0 };
  if (!(await rankedDiscordEnabled())) return result;
  const [rules, timeZone] = await Promise.all([getRankedRules(), getSetting("game.timeZone")]);
  if (rules.enabled) await rollSeasonWith(prisma, new Date(), rules, timeZone);
  const closed = await prisma.season.findMany({
    where: { closedAt: { not: null }, leaderboardSnapshot: { not: Prisma.DbNull }, discordPost: { is: null } },
    orderBy: { number: "asc" }, take: 5, select: { id: true },
  });
  if (closed.length) await prisma.discordPost.createMany({ data: closed.map((season) => ({ key: `season:${season.id}`, seasonId: season.id, channelId: env.DISCORD_RANKED_CHANNEL_ID! })), skipDuplicates: true });
  const posts = await prisma.discordPost.findMany({
    where: { seasonId: { not: null }, nextAttemptAt: { lte: new Date() }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }] },
    orderBy: { nextAttemptAt: "asc" }, take: 3, select: { key: true, season: { select: { leaderboardSnapshot: true } } },
  });
  for (const post of posts) {
    if (Date.now() + 20_000 > deadline) break;
    try {
      const snapshot = seasonSnapshotSchema.parse(post.season?.leaderboardSnapshot);
      const png = new Uint8Array(await (await seasonImage(snapshot)).arrayBuffer());
      await resolveDiscordAlert("ranked-render", post.key);
      const published = await publishDiscordPost(post.key, seasonMessage(snapshot), null, false, {
        mentionRoleId: env.DISCORD_FIGHTER_ROLE_ID,
        attachment: { filename: `kiraku-saison-${snapshot.number}.png`, data: png, contentType: "image/png" },
      });
      if (published.ok) result.published++;
      else result.failed++;
    } catch {
      result.failed++;
      await prisma.discordPost.updateMany({
        where: { key: post.key, OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }] },
        data: { nextAttemptAt: new Date(Date.now() + 300_000) },
      });
      console.warn("[discord] annonce de saison reportée au prochain passage.");
      await recordDiscordAlert("ranked-render", post.key);
    }
  }
  return result;
}
