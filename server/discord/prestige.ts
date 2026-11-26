import "server-only";
import { profileUsername } from "@/lib/collection/display-name";
import { engravedMessage, rebirthMessage } from "@/lib/discord/prestige-message";
import { readHeirs } from "@/lib/prestige/journey";
import { sealOf } from "@/lib/prestige/printing";
import { prisma } from "../db";
import { appUrl, discordPrestigeConfigured, env } from "../env";
import { getPrintingSeals } from "../prestige/rules";
import { getSetting } from "../settings";
import { discordPaused } from "./api";
import { discordPlayerName, discordPlayerSelect } from "./labels";
import { dropDiscordPost, publishDiscordPost } from "./posts";

// Annonces du prestige dans DISCORD_PRESTIGE_CHANNEL_ID (interrupteur discord.prestigeEnabled) : chaque renaissance et
// chaque édition gravée tirée. Mises en file puis publiées par le cron de la minute, jamais dans la transaction de jeu.
// Clés : prestige:rebirth:{id du cycle}, prestige:engraved:{id du gros tirage}.

const HOUR = 3_600_000;
// Au-delà, une annonce manquée (bot coupé, réglage allumé tard) n'est plus publiée
const GRACE_MS = 6 * HOUR;

export async function discordPrestigeChannel(): Promise<string | undefined> {
  return discordPrestigeConfigured && (await getSetting("discord.prestigeEnabled")) ? env.DISCORD_PRESTIGE_CHANNEL_ID : undefined;
}

/** Pseudo affichable et lien de profil : un profil privé ou réservé aux amis est annoncé « Un joueur ». */
function shown(player: { id: string; username: string; profileVisibility: "PUBLIC" | "FRIENDS" | "PRIVATE"; bannedAt: Date | null; anonymizedAt: Date | null }) {
  const name = discordPlayerName(player);
  return { name, username: profileUsername({ name, revealed: false }, player.username) };
}

async function publishRebirth(key: string, cycleId: string): Promise<boolean> {
  const cycle = await prisma.prestigeCycle.findUnique({
    where: { id: cycleId },
    select: { number: true, globalRank: true, heirs: true, user: { select: discordPlayerSelect } },
  });
  if (!cycle) {
    await dropDiscordPost(key);
    return false;
  }
  const payload = rebirthMessage({ ...shown(cycle.user), prestige: cycle.number, globalRank: cycle.globalRank, heirs: readHeirs(cycle.heirs).length }, appUrl());
  return (await publishDiscordPost(key, payload, null)).ok;
}

async function publishEngraved(key: string, pullId: string): Promise<boolean> {
  const pull = await prisma.notablePull.findUnique({
    where: { id: pullId },
    select: {
      printing: true,
      serial: true,
      printingSize: true,
      user: { select: discordPlayerSelect },
      card: { select: { name: true, imageUrl: true, spoiler: true, publicId: true, rarityDefinition: { select: { nameFr: true } } } },
    },
  });
  if (!pull || pull.printing === null || pull.serial === null || pull.printingSize === null) {
    await dropDiscordPost(key);
    return false;
  }
  const seals = await getPrintingSeals();
  const payload = engravedMessage(
    {
      name: shown(pull.user).name,
      seal: sealOf(pull.printing, seals),
      serial: pull.serial,
      size: pull.printingSize,
      card: { name: pull.card.name, imageUrl: pull.card.imageUrl, spoiler: pull.card.spoiler, rarityName: pull.card.rarityDefinition.nameFr, anilistId: pull.card.publicId },
    },
    appUrl(),
  );
  return (await publishDiscordPost(key, payload, null)).ok;
}

/** Passage du cron minute : renaissances et gravées récentes mises en file, puis quelques publications. */
export async function syncDiscordPrestige(deadline = Date.now() + 15_000): Promise<{ relayed: number; failed: number }> {
  const result = { relayed: 0, failed: 0 };
  const channelId = await discordPrestigeChannel();
  if (!channelId) return result;
  const since = new Date(Date.now() - GRACE_MS);
  // Événements déjà en file écartés : sinon les 20 plus anciens de la fenêtre reviendraient à chaque passage et les
  // suivants attendraient leur sortie. Une ligne de file est toujours créée après son événement (createdAt ≥ since).
  const queued = await prisma.discordPost.findMany({ where: { key: { startsWith: "prestige:" }, createdAt: { gte: since } }, select: { key: true } });
  const known = (kind: "rebirth" | "engraved") => queued.flatMap((p) => (p.key.startsWith(`prestige:${kind}:`) ? [p.key.slice(`prestige:${kind}:`.length)] : []));
  const [cycles, pulls] = await Promise.all([
    prisma.prestigeCycle.findMany({ where: { createdAt: { gte: since }, id: { notIn: known("rebirth") } }, orderBy: { createdAt: "asc" }, take: 20, select: { id: true } }),
    prisma.notablePull.findMany({
      where: { createdAt: { gte: since }, printing: { not: null }, id: { notIn: known("engraved") } },
      orderBy: { createdAt: "asc" },
      take: 20,
      select: { id: true },
    }),
  ]);
  const keys = [...cycles.map((c) => `prestige:rebirth:${c.id}`), ...pulls.map((p) => `prestige:engraved:${p.id}`)];
  if (keys.length > 0) {
    // Une clé par annonce : une renaissance ou une gravée n'est jamais mise en file deux fois
    await prisma.discordPost.createMany({ data: keys.map((key) => ({ key, channelId })), skipDuplicates: true });
  }
  const posts = await prisma.discordPost.findMany({
    where: { key: { startsWith: "prestige:" }, nextAttemptAt: { lte: new Date() }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }] },
    orderBy: { nextAttemptAt: "asc" },
    take: 5,
    select: { key: true },
  });
  for (const post of posts) {
    if (Date.now() + 5_000 > deadline || discordPaused()) break;
    const [, kind, id] = post.key.split(":");
    try {
      const ok = kind === "rebirth" ? await publishRebirth(post.key, id) : kind === "engraved" ? await publishEngraved(post.key, id) : false;
      if (ok) result.relayed++;
      else result.failed++;
    } catch {
      result.failed++;
      console.warn("[discord] annonce du prestige reportée.");
    }
  }
  return result;
}
