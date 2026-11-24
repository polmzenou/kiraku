import "server-only";
import { getTranslations } from "next-intl/server";
import type { DiscordMessageBody } from "@/lib/discord/community";
import { rankLabel, referralLaunchMessage, type AnnounceEnnichi } from "@/lib/discord/referral-announce";
import { lotText } from "@/lib/referral/lot-text";
import { stepConditions } from "@/components/referral/step-meta";
import { getRarityDefinitions } from "../catalog/rarities";
import { prisma } from "../db";
import { appUrl, discordAnnounceConfigured, env } from "../env";
import { ennichiView } from "../ennichi/queries";
import { referralV2Rules } from "../referral/deps";
import { referralGifts } from "../referral/queries";
import { discordBotRequest } from "./api";
import { publishDiscordPost, type PublishResult } from "./posts";

// Annonce du lancement du parrainage v2 (et de l'Ennichi s'il est annoncé ou en cours) dans le salon public des annonces,
// publiée ou mise à jour depuis l'admin. Clé à part (« announce: ») : aucun cron ne la reprend, seul le bouton publie.
// Les montants sont ceux réglés au moment de publier ; une mise à jour corrige le message sans mentionner de nouveau.

const KANJI = ["一", "二", "三", "四"] as const;
const TITLES = { yokozuna: "Yokozuna", ozeki: "Ōzeki", sekiwake: "Sekiwake" } as const;
const vouchers = (n: number) => (n > 0 ? `${n} Mythique${n > 1 ? "s" : ""} au choix` : null);
const join = (parts: (string | null)[]) => parts.filter(Boolean).join(" · ") || "—";

const announceKey = () => `announce:referral:${env.DISCORD_GUILD_ID}:${env.DISCORD_ANNOUNCE_CHANNEL_ID}`;

/** Le message tel qu'il partirait maintenant, en français (langue du salon). */
export async function referralAnnouncePayload(): Promise<DiscordMessageBody> {
  const rules = await referralV2Rules();
  const [{ steps }, fete, rarities, t] = await Promise.all([
    referralGifts(rules, "fr", 0),
    ennichiView("fr"),
    getRarityDefinitions(),
    getTranslations({ locale: "fr", namespace: "referralV2.steps" }),
  ]);
  const names = new Map(rarities.map((r) => [r.key, r.nameFr]));
  const rarity = (key: string) => names.get(key) ?? key;
  const conditions = stepConditions(rules);
  const n = (step: number) => Math.min(4, Math.max(1, step)) as 1 | 2 | 3 | 4;
  const ennichi: AnnounceEnnichi | null =
    (fete.phase === "before" || fete.phase === "live") && fete.startsAt
      ? {
          live: fete.phase === "live",
          startsAt: new Date(fete.startsAt),
          days: fete.days,
          multiplier: fete.multiplier,
          tiers: fete.tiers.map((tier) => ({ lanterns: tier.lanterns, gifts: join([lotText(tier.lot, rarity), vouchers(tier.choiceVouchers)]) })),
          ranks: fete.ranks.map((r) => ({
            label: rankLabel(r.from, r.to),
            gifts: join([r.title ? `titre ${TITLES[r.title]}` : null, lotText(r.lot, rarity), r.oneOfOne ? "carte 1/1 au choix" : null, vouchers(r.choiceVouchers)]),
          })),
          pool: fete.pool.map((p) => (p.oneOfOne ? `${p.count} carte${p.count > 1 ? "s" : ""} 1/1 au choix` : lotText(p.lot, rarity, p.count))).filter(Boolean).join(", ") || null,
        }
      : null;
  return referralLaunchMessage({
    steps: steps.map((s, i) => ({
      kanji: KANJI[i] ?? String(i + 1),
      say: t(`${n(s.step)}.say`, conditions),
      friend: lotText(s.referee, rarity, i < 2 && fete.phase === "live" ? fete.multiplier : 1),
      you: lotText(s.referrerTotal, rarity, i < 2 && fete.phase === "live" ? fete.multiplier : 1),
    })),
    ennichi,
    origin: appUrl(),
  });
}

export type ReferralAnnounceState = { configured: boolean; publishedAt: Date | null; url: string | null };

/** Salon configuré, et message déjà publié (date de la première publication, lien). */
export async function referralAnnounceState(): Promise<ReferralAnnounceState> {
  if (!discordAnnounceConfigured) return { configured: false, publishedAt: null, url: null };
  const post = await prisma.discordPost.findUnique({ where: { key: announceKey() }, select: { messageId: true, createdAt: true } });
  return {
    configured: true,
    publishedAt: post?.messageId ? post.createdAt : null,
    url: post?.messageId ? `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${env.DISCORD_ANNOUNCE_CHANNEL_ID}/${post.messageId}` : null,
  };
}

/** Publie l'annonce, ou met à jour celle déjà publiée (sans nouvelle mention). Le salon doit être un salon texte du serveur. */
export async function publishReferralAnnouncement(): Promise<(PublishResult & { url?: string }) | { ok: false; error: "CONFIG" }> {
  if (!discordAnnounceConfigured) return { ok: false, error: "CONFIG" };
  const channel = await discordBotRequest<{ guild_id: string; type: number }>(`/channels/${env.DISCORD_ANNOUNCE_CHANNEL_ID}`);
  if (channel.guild_id !== env.DISCORD_GUILD_ID || ![0, 5].includes(channel.type)) return { ok: false, error: "CONFIG" };
  const key = announceKey();
  await prisma.discordPost.upsert({ where: { key }, update: {}, create: { key, channelId: env.DISCORD_ANNOUNCE_CHANNEL_ID!, nextAttemptAt: null } });
  const result = await publishDiscordPost(key, await referralAnnouncePayload(), null, true);
  return result.ok ? { ...result, url: `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${env.DISCORD_ANNOUNCE_CHANNEL_ID}/${result.messageId}` } : result;
}
