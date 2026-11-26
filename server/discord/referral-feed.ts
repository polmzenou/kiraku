import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Reason } from "@/lib/anticheat/score";
import type { DetectionScoring } from "@/lib/anticheat/scoring";
import {
  ambassadorDecisionMessage,
  clueText,
  decisionMessage,
  ennichiResultsMessage,
  ennichiTierMessage,
  grandPayoutMessage,
  holdMessage,
  milestonePayoutMessage,
  stepPayoutMessage,
  trustPayoutMessage,
  type FeedReferral,
} from "@/lib/discord/referral-feed";
import { lotText } from "@/lib/referral/lot-text";
import type { ReferralV2Rules } from "@/lib/referral/rules";
import type { DiscordMessageBody } from "@/lib/discord/community";
import { getRarityDefinitions } from "../catalog/rarities";
import { prisma } from "../db";
import { lotViews } from "../economy/lot-view";
import { appUrl, discordReferralConfigured, env } from "../env";
import { referralV2Rules } from "../referral/deps";
import { referralFiche, type FicheReward, type ReferralFiche } from "../referral/tracking-queries";
import { getSetting } from "../settings";
import { assertPrivateDiscordChannel } from "./private-channel";
import { dropDiscordPost, publishDiscordPost } from "./posts";

// Fil du parrainage v2 dans le salon privé de l'équipe (DISCORD_REFERRAL_CHANNEL_ID), publié par le cron de la minute,
// jamais dans une transaction de jeu. Les événements récents sont mis en file sous une clé unique (une seule annonce
// chacun), puis publiés dans l'ordre où ils sont arrivés :
//   referral:step:{parrainage}:{n}   étape versée (les deux côtés, et la part « confiance » versée en même temps)
//   referral:trust:{versement}       part « confiance » versée à part (Discord ancien lié après coup)
//   referral:milestone:{versement}   palier du parrain        referral:grand:{versement}  grand-parrainage
//   referral:hold:{parrainage}       mis « À vérifier »       referral:decision:{journal} décision de l'équipe
//   referral:ambassador:{proposition} Ambassadeur proposé accepté ou refusé par l'équipe
//   referral:ennichi-tier:{édition}:{palier}  palier de lanternes envoyé à tous   referral:ennichi-results:{édition}  tirage
// Sans la variable, rien n'est posté et le parrainage marche pareil. Le salon doit être privé (vérifié avant d'envoyer).

const DAY = 86_400_000;
// Au-delà, un événement manqué (bot coupé, salon ajouté tard) n'est plus posté : le suivi de l'admin le garde
const GRACE_MS = 2 * DAY;
// Versements d'un même passage : même instant (part « confiance » versée avec son étape)
const SAME_RUN_MS = 1_000;
const BATCH = 5;

export function discordReferralChannel(): string | undefined {
  return discordReferralConfigured ? env.DISCORD_REFERRAL_CHANNEL_ID : undefined;
}

/** Met en file les événements récents, chacun daté de son arrivée (ordre de publication). */
async function enqueue(channelId: string, since: Date): Promise<void> {
  const [rewards, holds, logs, proposals, tiers, draws] = await Promise.all([
    prisma.referralReward.findMany({
      where: { createdAt: { gte: since }, referralId: { not: null } },
      orderBy: { createdAt: "asc" },
      take: 500,
      select: { id: true, kind: true, step: true, referralId: true, createdAt: true },
    }),
    prisma.referral.findMany({ where: { version: 2, heldAt: { gte: since } }, take: 200, select: { id: true, heldAt: true } }),
    prisma.adminLog.findMany({
      where: { targetType: "Referral", action: { in: ["REFERRAL_VALIDATE", "REFERRAL_REVOKE"] }, createdAt: { gte: since } },
      take: 200,
      select: { id: true, createdAt: true },
    }),
    prisma.ambassadorProposal.findMany({ where: { decidedAt: { gte: since } }, take: 100, select: { id: true, decidedAt: true } }),
    prisma.ennichiTierReached.findMany({ where: { finishedAt: { gte: since } }, take: 20, select: { edition: true, tier: true, finishedAt: true } }),
    prisma.ennichiDraw.findMany({ where: { drawnAt: { gte: since } }, take: 5, select: { edition: true, drawnAt: true } }),
  ]);
  const rows = new Map<string, Date>();
  const add = (key: string, at: Date) => {
    const before = rows.get(key);
    if (!before || at < before) rows.set(key, at);
  };
  for (const w of rewards) {
    if (w.kind === "STEP") add(`referral:step:${w.referralId}:${w.step}`, w.createdAt);
    else if (w.kind === "MILESTONE") add(`referral:milestone:${w.id}`, w.createdAt);
    else if (w.kind === "GRAND") add(`referral:grand:${w.id}`, w.createdAt);
    else {
      // Part « confiance » versée avec une étape : elle est dans le message de cette étape
      const withStep = rewards.some((x) => x.kind === "STEP" && x.referralId === w.referralId && Math.abs(x.createdAt.getTime() - w.createdAt.getTime()) <= SAME_RUN_MS);
      if (!withStep) add(`referral:trust:${w.id}`, w.createdAt);
    }
  }
  for (const h of holds) if (h.heldAt) add(`referral:hold:${h.id}`, h.heldAt);
  for (const l of logs) add(`referral:decision:${l.id}`, l.createdAt);
  for (const p of proposals) if (p.decidedAt) add(`referral:ambassador:${p.id}`, p.decidedAt);
  for (const t of tiers) if (t.finishedAt) add(`referral:ennichi-tier:${t.edition}:${t.tier}`, t.finishedAt);
  for (const d of draws) if (d.drawnAt) add(`referral:ennichi-results:${d.edition}`, d.drawnAt);
  if (rows.size === 0) return;
  await prisma.discordPost.createMany({
    data: [...rows].map(([key, at]) => ({ key, channelId, nextAttemptAt: at })),
    skipDuplicates: true,
  });
}

type Context = { rules: ReferralV2Rules; timeZone: string; sharedCap: number; scoring?: DetectionScoring; now: Date; rarity: (key: string) => string; origin: string };

/** Joueurs et paire du parrainage, tels que le message les montre. */
function feedBase(f: ReferralFiche, now: Date): FeedReferral {
  const days = (iso: string) => Math.max(0, (now.getTime() - new Date(iso).getTime()) / DAY);
  return {
    referralId: f.id,
    referee: {
      name: f.referee.name,
      accountDays: days(f.referee.since),
      via: f.referee.via,
      discordDays: f.referee.discordCreatedAt ? days(f.referee.discordCreatedAt) : null,
      trust: f.trust,
      openings: f.referee.openings,
      activeDays: f.referee.activeDays,
    },
    referrer: { name: f.referrer.name, installed: f.referrer.installed, milestones: f.referrer.milestones.length, received: f.referrer.received },
    pair: { sharedDevice: f.pair.sharedDevice, sharedIp: f.pair.sharedIp, score: f.pair.live.score },
  };
}

const rewardsOf = (f: ReferralFiche): FicheReward[] => [...f.steps.flatMap((s) => s.rewards), ...f.events.flatMap((e) => (e.reward ? [e.reward] : []))];
const sameRun = (a: FicheReward, b: FicheReward) => Math.abs(new Date(a.at).getTime() - new Date(b.at).getTime()) <= SAME_RUN_MS;

async function ficheOf(referralId: string, ctx: Context): Promise<ReferralFiche | null> {
  return referralFiche(referralId, ctx.rules, { timeZone: ctx.timeZone, locale: "fr", now: ctx.now, sharedCap: ctx.sharedCap, scoring: ctx.scoring });
}

function joinLots(rewards: readonly FicheReward[], ctx: Context): string | null {
  const parts = rewards.map((w) => lotText(w.lot, ctx.rarity, w.multiplier)).filter((t): t is string => t !== null);
  return parts.length ? parts.join(" · ") : null;
}

async function stepPayload(referralId: string, step: number, ctx: Context): Promise<DiscordMessageBody | null> {
  const fiche = await ficheOf(referralId, ctx);
  if (!fiche || step < 1 || step > 4) return null;
  const all = rewardsOf(fiche);
  const toReferee = all.find((w) => w.kind === "STEP" && w.side === "REFEREE" && w.step === step) ?? null;
  const toReferrer = all.find((w) => w.kind === "STEP" && w.side === "REFERRER" && w.step === step) ?? null;
  const anchor = toReferrer ?? toReferee;
  if (!anchor) return null;
  const trusts = all.filter((w) => w.kind === "TRUST_BONUS" && sameRun(w, anchor));
  const trustKept = step <= 2 && fiche.trust === "MEDIUM" && ctx.rules.stepLots[step - 1].referrerTrust !== null && !all.some((w) => w.kind === "TRUST_BONUS" && w.step === step);
  return stepPayoutMessage(
    {
      ...feedBase(fiche, ctx.now),
      step: step as 1 | 2 | 3 | 4,
      toReferee: toReferee ? joinLots([toReferee], ctx) : null,
      toReferrer: joinLots([...(toReferrer ? [toReferrer] : []), ...trusts], ctx),
      trustKept,
      multiplier: Math.max(1, toReferee?.multiplier ?? 1, toReferrer?.multiplier ?? 1),
    },
    ctx.origin,
  );
}

async function rewardPayload(kind: "trust" | "milestone" | "grand", rewardId: string, ctx: Context): Promise<DiscordMessageBody | null> {
  const row = await prisma.referralReward.findUnique({ where: { id: rewardId }, select: { referralId: true } });
  if (!row?.referralId) return null;
  const fiche = await ficheOf(row.referralId, ctx);
  const reward = fiche ? rewardsOf(fiche).find((w) => w.id === rewardId) : null;
  if (!fiche || !reward) return null;
  if (kind === "trust") return trustPayoutMessage({ ...feedBase(fiche, ctx.now), step: reward.step ?? 1, toReferrer: joinLots([reward], ctx) }, ctx.origin);
  if (kind === "grand") {
    return grandPayoutMessage({ referralId: fiche.id, referee: fiche.referee.name, referrer: fiche.referrer.name, grand: reward.to, reward: joinLots([reward], ctx) }, ctx.origin);
  }
  const rung = ctx.rules.milestones.find((m) => m.installed === reward.milestone);
  const extras = [
    rung && rung.choiceVouchers > 0 ? `${rung.choiceVouchers} Mythique${rung.choiceVouchers > 1 ? "s" : ""} au choix` : null,
    rung?.oneOfOne ? "carte 1/1" : null,
    rung?.ambassador ? "rôle Ambassadeur proposé à l'équipe" : null,
    rung?.legend ? "mur des légendes" : null,
  ].filter((x): x is string => x !== null);
  return milestonePayoutMessage(
    { referralId: fiche.id, referrer: feedBase(fiche, ctx.now).referrer, milestone: reward.milestone ?? 0, reward: joinLots([reward], ctx), extras },
    ctx.origin,
  );
}

async function holdPayload(referralId: string, ctx: Context): Promise<DiscordMessageBody | null> {
  const [fiche, held] = await Promise.all([
    ficheOf(referralId, ctx),
    prisma.referral.findUnique({ where: { id: referralId }, select: { holdReason: true, holdEvidence: true, score: true } }),
  ]);
  if (!fiche || !held?.holdReason) return null;
  const ev = (held.holdEvidence && typeof held.holdEvidence === "object" && !Array.isArray(held.holdEvidence) ? held.holdEvidence : {}) as {
    device?: { withReferrer?: unknown; siblings?: unknown };
    score?: { reasons?: unknown };
  };
  const reasons = Array.isArray(ev.score?.reasons) ? (ev.score.reasons as Reason[]) : [];
  const siblings = Array.isArray(ev.device?.siblings) ? ev.device.siblings.length : 0;
  const clues = [
    ...(ev.device?.withReferrer === true ? ["Même appareil que le parrain"] : []),
    ...(siblings > 0 ? [`Même appareil que ${siblings} autre${siblings > 1 ? "s" : ""} filleul${siblings > 1 ? "s" : ""} du parrain`] : []),
    ...reasons.map((r) => clueText(r, ctx.scoring)),
  ];
  const base = feedBase(fiche, ctx.now);
  return holdMessage(
    {
      ...base,
      pair: { ...base.pair, sharedDevice: base.pair.sharedDevice || ev.device !== undefined, score: held.score ?? base.pair.score },
      reason: held.holdReason,
      clues,
      threshold: ctx.rules.holdScore,
      waitingSteps: fiche.steps.flatMap((s, i) => (s.at && !s.rewards.some((w) => w.kind === "STEP") ? [i + 1] : [])),
    },
    ctx.origin,
  );
}

async function decisionPayload(logId: string, ctx: Context): Promise<DiscordMessageBody | null> {
  const log = await prisma.adminLog.findUnique({ where: { id: logId }, select: { action: true, targetId: true, after: true, admin: { select: { username: true } } } });
  if (!log?.targetId) return null;
  const fiche = await ficheOf(log.targetId, ctx);
  if (!fiche) return null;
  const after = (log.after && typeof log.after === "object" && !Array.isArray(log.after) ? log.after : {}) as Record<string, unknown>;
  const decision = log.action === "REFERRAL_VALIDATE" ? "VALIDATED" : after.ban === true ? "BANNED" : "REVOKED";
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return decisionMessage(
    {
      referralId: fiche.id,
      referee: fiche.referee.name,
      referrer: fiche.referrer.name,
      decision,
      by: log.admin.username,
      reason: text(after.reason) ?? text(after.note),
      taken: decision === "BANNED" ? takenText(after.reports) : null,
    },
    ctx.origin,
  );
}

async function ambassadorPayload(proposalId: string, ctx: Context): Promise<DiscordMessageBody | null> {
  const p = await prisma.ambassadorProposal.findUnique({
    where: { id: proposalId },
    select: { installed: true, accepted: true, decidedAt: true, user: { select: { id: true, username: true } }, decidedBy: { select: { username: true } } },
  });
  if (!p?.decidedAt || p.accepted === null) return null;
  return ambassadorDecisionMessage(
    { userId: p.user.id, name: p.user.username, installed: p.installed, accepted: p.accepted, by: p.decidedBy?.username ?? "l'équipe" },
    ctx.origin,
  );
}

async function ennichiTierPayload(edition: number, tier: number, ctx: Context): Promise<DiscordMessageBody | null> {
  const t = await prisma.ennichiTierReached.findUnique({ where: { edition_tier: { edition, tier } }, select: { lanterns: true, lotId: true, choiceVouchers: true, served: true } });
  if (!t) return null;
  const lot = t.lotId ? (await lotViews([t.lotId], "fr")).get(t.lotId) ?? null : null;
  return ennichiTierMessage({ edition, tier, lanterns: t.lanterns, lot: lotText(lot, ctx.rarity, 1), vouchers: t.choiceVouchers, served: t.served }, ctx.origin);
}

async function ennichiResultsPayload(edition: number, ctx: Context): Promise<DiscordMessageBody | null> {
  const [draw, top, ranked, draws] = await Promise.all([
    prisma.ennichiDraw.findUnique({ where: { edition }, select: { drawnAt: true, drawnById: true, tickets: true } }),
    prisma.ennichiResult.findMany({ where: { edition }, orderBy: { rank: "asc" }, take: 3, select: { rank: true, name: true, count: true, title: true } }),
    prisma.ennichiResult.count({ where: { edition } }),
    prisma.ennichiAward.count({ where: { edition, kind: "OMIKUJI" } }),
  ]);
  if (!draw?.drawnAt) return null;
  const by = draw.drawnById ? (await prisma.user.findUnique({ where: { id: draw.drawnById }, select: { username: true } }))?.username ?? null : null;
  const tickets = Array.isArray(draw.tickets) ? draw.tickets.length : 0;
  return ennichiResultsMessage({ edition, by, top, ranked, tickets, draws }, ctx.origin);
}

/** Ce que « Révoquer et bannir » a repris (journal de la décision), en une ligne. */
function takenText(raw: unknown): string | null {
  if (!Array.isArray(raw)) return null;
  let zeni = 0;
  let boosters = 0;
  let cards = 0;
  let vouchers = 0;
  for (const r of raw as { taken?: { zeni?: unknown; credits?: unknown; sealedIds?: unknown; cardIds?: unknown; voucherIds?: unknown } }[]) {
    const t = r?.taken;
    if (!t) continue;
    zeni += typeof t.zeni === "number" ? t.zeni : 0;
    if (t.credits && typeof t.credits === "object") for (const n of Object.values(t.credits as Record<string, unknown>)) boosters += typeof n === "number" ? n : 0;
    boosters += Array.isArray(t.sealedIds) ? t.sealedIds.length : 0;
    cards += Array.isArray(t.cardIds) ? t.cardIds.length : 0;
    vouchers += Array.isArray(t.voucherIds) ? t.voucherIds.length : 0;
  }
  const nf = new Intl.NumberFormat("fr-FR");
  const parts = [
    zeni > 0 ? `${nf.format(zeni)} Zeni` : null,
    boosters > 0 ? `${nf.format(boosters)} booster${boosters > 1 ? "s" : ""}` : null,
    cards > 0 ? `${nf.format(cards)} carte${cards > 1 ? "s" : ""}` : null,
    vouchers > 0 ? `${nf.format(vouchers)} bon${vouchers > 1 ? "s" : ""}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

async function payloadFor(key: string, ctx: Context): Promise<DiscordMessageBody | null> {
  const [, kind, id, step] = key.split(":");
  if (!id) return null;
  if (kind === "step") return stepPayload(id, Number(step), ctx);
  if (kind === "trust" || kind === "milestone" || kind === "grand") return rewardPayload(kind, id, ctx);
  if (kind === "hold") return holdPayload(id, ctx);
  if (kind === "decision") return decisionPayload(id, ctx);
  if (kind === "ambassador") return ambassadorPayload(id, ctx);
  if (kind === "ennichi-tier") return ennichiTierPayload(Number(id), Number(step), ctx);
  if (kind === "ennichi-results") return ennichiResultsPayload(Number(id), ctx);
  return null;
}

/** Passage du cron minute : événements récents mis en file, puis quelques publications, dans l'ordre d'arrivée. */
export async function syncDiscordReferrals(deadline = Date.now() + 15_000): Promise<{ relayed: number; failed: number }> {
  const result = { relayed: 0, failed: 0 };
  const channelId = discordReferralChannel();
  if (!channelId) return result;
  const now = new Date();
  await enqueue(channelId, new Date(now.getTime() - GRACE_MS));
  const due: Prisma.DiscordPostWhereInput = { key: { startsWith: "referral:" }, nextAttemptAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] };
  const posts = await prisma.discordPost.findMany({ where: due, orderBy: { nextAttemptAt: "asc" }, take: BATCH, select: { key: true } });
  if (posts.length === 0) return result;
  try {
    await assertPrivateDiscordChannel(channelId);
  } catch {
    console.warn("[discord] salon du parrainage inaccessible ou lisible par les joueurs : rien n'est posté.");
    return { relayed: 0, failed: posts.length };
  }
  const [rules, timeZone, sharedCap, scoring, rarities] = await Promise.all([referralV2Rules(), getSetting("game.timeZone"), getSetting("multiAccount.sharedIpCap"), getSetting("multiAccount.scoring"), getRarityDefinitions()]);
  const names = new Map(rarities.map((r) => [r.key, r.nameFr]));
  const ctx: Context = { rules, timeZone, sharedCap, scoring, now, rarity: (key) => names.get(key) ?? key, origin: appUrl() };
  for (const post of posts) {
    if (Date.now() + 5_000 > deadline) break;
    try {
      const payload = await payloadFor(post.key, ctx);
      if (!payload) {
        await dropDiscordPost(post.key);
        continue;
      }
      if ((await publishDiscordPost(post.key, payload, null)).ok) result.relayed++;
      else result.failed++;
    } catch {
      result.failed++;
      // Message impossible à préparer : retenté dans dix minutes, pas à chaque passage
      await prisma.discordPost.updateMany({ where: { key: post.key, messageId: null }, data: { nextAttemptAt: new Date(Date.now() + 600_000) } });
      console.warn("[discord] message du parrainage reporté.");
    }
  }
  return result;
}
