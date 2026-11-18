import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { displayNameFor } from "@/lib/collection/display-name";
import { casinoPhase } from "@/lib/casino/phase";
import { isBigFlip } from "@/lib/casino/tiers";
import { bigFlipMessage, casinoOpeningMessage, casinoTeaserMessage } from "@/lib/discord/casino-message";
import { getRarityDefinitions } from "../catalog/rarities";
import { getCasinoRules } from "../casino/queries";
import { prisma } from "../db";
import { appUrl, discordCasinoConfigured, env } from "../env";
import { readEventGauge } from "../home/event-gauge";
import { getSetting } from "../settings";
import { publishDiscordPost, type PublishResult } from "./posts";

// Annonces du casino dans DISCORD_CASINO_CHANNEL_ID : teaser posté depuis l'admin, ouverture postée une seule fois
// par le cron quand casino.opensAt passe, relais des gros lancers. Aucun appel Discord dans une transaction de jeu.

const HOUR = 3_600_000;
// Au-delà, une ouverture ou un lancer manqués (bot coupé, réglage allumé tard) ne sont plus annoncés
const OPENING_GRACE_MS = 24 * HOUR;
const FLIP_GRACE_MS = 6 * HOUR;

export async function discordCasinoChannel(): Promise<string | undefined> {
  return discordCasinoConfigured && (await getSetting("discord.casinoEnabled")) ? env.DISCORD_CASINO_CHANNEL_ID : undefined;
}

const teaserKey = () => `casino:teaser:${env.DISCORD_GUILD_ID}:${env.DISCORD_CASINO_CHANNEL_ID}`;
const openingKey = (opensAt: number) => `casino:opening:${new Date(opensAt).toISOString()}`;

/** Teaser : publié ou actualisé à la demande de l'admin (date, compte à rebours). */
export async function publishCasinoTeaser(): Promise<PublishResult | { ok: false; error: "CONFIG" }> {
  if (!discordCasinoConfigured) return { ok: false, error: "CONFIG" };
  const rules = await getCasinoRules();
  const key = teaserKey();
  await prisma.discordPost.upsert({ where: { key }, update: {}, create: { key, channelId: env.DISCORD_CASINO_CHANNEL_ID!, nextAttemptAt: null } });
  return publishDiscordPost(key, casinoTeaserMessage({ opensAt: rules.opensAt === null ? null : new Date(rules.opensAt), origin: appUrl() }), null, true);
}

/** L'ouverture, une seule fois : clé liée à la date d'ouverture (une date déplacée donnerait une nouvelle annonce). */
async function syncOpening(now: number): Promise<boolean> {
  const rules = await getCasinoRules();
  if (rules.opensAt === null || casinoPhase(rules, now) !== "open" || now - rules.opensAt > OPENING_GRACE_MS) return false;
  const key = openingKey(rules.opensAt);
  const existing = await prisma.discordPost.findUnique({ where: { key }, select: { messageId: true, nextAttemptAt: true } });
  if (existing && (existing.messageId || !existing.nextAttemptAt || existing.nextAttemptAt > new Date(now))) return false;
  if (!existing) await prisma.discordPost.createMany({ data: [{ key, channelId: env.DISCORD_CASINO_CHANNEL_ID! }], skipDuplicates: true });
  const gauge = await readEventGauge(now);
  const flips = gauge?.metric === "COINFLIPS" && gauge.phase !== "ended" ? gauge : null;
  // La bande-annonce (avec le son) est jointe au message : Discord la lit sur place
  const trailer = await readFile(join(process.cwd(), "public", "casino", "discord", "trailer-v1.mp4")).catch(() => null);
  const result = await publishDiscordPost(key, casinoOpeningMessage({ origin: appUrl(), goal: flips?.goal ?? null, reward: flips?.reward ?? null }), null, false, {
    ...(trailer && { attachment: { filename: "kiraku-casino.mp4", data: new Uint8Array(trailer), contentType: "video/mp4" } }),
  });
  return result.ok;
}

/** Relais d'un gros lancer, relu en base : pseudo affichable, carte, face sortie. */
async function syncFlip(key: string, flipId: string): Promise<boolean> {
  const flip = await prisma.coinFlip.findUnique({
    where: { id: flipId },
    select: {
      id: true,
      status: true,
      result: true,
      winnerId: true,
      creatorId: true,
      creatorRarity: true,
      creator: { select: { id: true, username: true, profileVisibility: true, bannedAt: true, anonymizedAt: true } },
      opponent: { select: { id: true, username: true, profileVisibility: true, bannedAt: true, anonymizedAt: true } },
      creatorCard: { select: { name: true, imageUrl: true, spoiler: true, rarityDefinition: { select: { nameFr: true, seal: true } } } },
      opponentCard: { select: { name: true, imageUrl: true, spoiler: true, rarityDefinition: { select: { nameFr: true, seal: true } } } },
    },
  });
  if (!flip || flip.status !== "DONE" || !flip.result || !flip.opponent || !flip.opponentCard) {
    await prisma.discordPost.updateMany({ where: { key, messageId: null }, data: { nextAttemptAt: null } });
    return false;
  }
  const creatorWon = flip.winnerId === flip.creatorId;
  const winner = creatorWon ? flip.creator : flip.opponent;
  // Le gagnant emporte la fuda de l'autre
  const prize = creatorWon ? flip.opponentCard : flip.creatorCard;
  const payload = bigFlipMessage(
    {
      id: flip.id,
      winnerName: displayNameFor(winner, null, { friends: false, blocked: false }, { hidden: "Un joueur", deleted: "Compte supprimé" }),
      seal: prize.rarityDefinition.seal,
      result: flip.result,
      card: { name: prize.name, imageUrl: prize.imageUrl, spoiler: prize.spoiler, rarityName: prize.rarityDefinition.nameFr },
    },
    appUrl(),
  );
  return (await publishDiscordPost(key, payload, null)).ok;
}

/** Passage du cron minute : ouverture à l'heure dite, puis gros lancers récents (mis en file, puis publiés). */
export async function syncDiscordCasino(deadline = Date.now() + 25_000): Promise<{ opening: boolean; relayed: number; failed: number }> {
  const result = { opening: false, relayed: 0, failed: 0 };
  if (!(await discordCasinoChannel())) return result;
  const now = Date.now();
  result.opening = await syncOpening(now);

  // Lancers joués dans les dernières heures, au moins du palier réglé, pas encore en file
  const [minRarity, definitions] = await Promise.all([getSetting("discord.casinoMinRarity"), getRarityDefinitions()]);
  const big = definitions.filter((d) => isBigFlip(d.key, minRarity, definitions)).map((d) => d.key);
  const fresh = await prisma.coinFlip.findMany({
    where: { status: "DONE", resolvedAt: { gte: new Date(now - FLIP_GRACE_MS) }, creatorRarity: { in: big }, discordPost: { is: null } },
    orderBy: { resolvedAt: "asc" },
    take: 20,
    select: { id: true },
  });
  if (fresh.length > 0) {
    await prisma.discordPost.createMany({
      data: fresh.map((f) => ({ key: `coinflip:${f.id}`, coinFlipId: f.id, channelId: env.DISCORD_CASINO_CHANNEL_ID! })),
      skipDuplicates: true,
    });
  }
  const posts = await prisma.discordPost.findMany({
    where: { coinFlipId: { not: null }, nextAttemptAt: { lte: new Date() }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }] },
    orderBy: { nextAttemptAt: "asc" },
    take: 5,
    select: { key: true, coinFlipId: true },
  });
  for (const post of posts) {
    if (Date.now() + 10_000 > deadline) break;
    try {
      if (await syncFlip(post.key, post.coinFlipId!)) result.relayed++;
      else result.failed++;
    } catch {
      result.failed++;
      console.warn("[discord] relais d'un lancer reporté.");
    }
  }
  return result;
}
