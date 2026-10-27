import "server-only";
import type { PollSettings } from "@/lib/usage/estimate";
import { prisma } from "../db";
import { ablyEnabled } from "../env";
import { getSetting } from "../settings";

/** Réglages de sondage en cours, pour l'estimation de consommation de /admin/general. */
export async function currentPollSettings(): Promise<PollSettings> {
  const [notif, safety, chat, feed, battle, battleSafety, queue, lobby, market] = await Promise.all([
    getSetting("notifications.pollSeconds"),
    getSetting("realtime.safetyPollSeconds"),
    getSetting("chat.pollSeconds"),
    getSetting("home.pullFeed.refreshSeconds"),
    getSetting("battle.pollSeconds"),
    getSetting("battle.safetyPollSeconds"),
    getSetting("battle.queuePollSeconds"),
    getSetting("battle.lobbyPollSeconds"),
    getSetting("market.pollSeconds"),
  ]);
  return {
    ablyEnabled,
    notificationsPollSeconds: notif,
    realtimeSafetySeconds: safety,
    chatPollSeconds: chat,
    pullFeedRefreshSeconds: feed,
    battlePollSeconds: battle,
    battleSafetySeconds: battleSafety,
    queuePollSeconds: queue,
    lobbyPollSeconds: lobby,
    marketPollSeconds: market,
  };
}

/** Joueurs actifs par jour sur les 7 derniers jours (au moins un mouvement de Zeni), en moyenne. */
export async function averageDailyPlayers(now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 7 * 86_400_000);
  const rows = await prisma.$queryRaw<{ players: bigint }[]>`
    SELECT COUNT(DISTINCT "userId") AS players
    FROM "CoinTransaction"
    WHERE "createdAt" >= ${since}
    GROUP BY date_trunc('day', "createdAt")`;
  if (rows.length === 0) return 0;
  return Math.round(rows.reduce((sum, r) => sum + Number(r.players), 0) / 7);
}
