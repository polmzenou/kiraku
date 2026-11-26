import "server-only";
import { randomBytes } from "node:crypto";
import { isStaff } from "@/lib/admin/roles";
import { checkPlayer } from "@/lib/casino/coinflip";
import { periodWindow } from "@/lib/economy/period";
import { getRarityDefinitions } from "../catalog/rarities";
import { prisma } from "../db";
import { env } from "../env";
import { checkReferralLocks } from "../referral/locks";
import { getSetting } from "../settings";
import { flipsToday, type CoinFlipContext, type CoinFlipErrorCode } from "./coinflip-core";
import { getCasinoRules } from "./queries";
import { coinFlipSeedKey } from "./seed";

// Dépendances serveur des tables de pile ou face : réglages, jour de jeu, registre des raretés, hasard du serveur et
// clé des graines scellées dérivée d'AUTH_SECRET. Le cœur (coinflip-core.ts) les reçoit injectées ; ce module reste
// à part pour que les lectures (queries.ts) ne chargent pas les variables d'environnement.

let seedKey: Buffer | null = null;

/** Clé des graines scellées (jamais le secret lui-même). */
function casinoSeedKey(): Buffer {
  seedKey ??= coinFlipSeedKey(env.AUTH_SECRET);
  return seedKey;
}

/** Début du jour de jeu (fuseau game.timeZone) : borne du quota de lancers. */
export async function gameDayStart(now: Date): Promise<Date> {
  return periodWindow("DAILY", now, await getSetting("game.timeZone")).start;
}

/** Contexte des opérations sur les tables : heure, réglages, jour de jeu, registre, hasard du serveur, clé des graines. */
export async function coinFlipContext(now = new Date()): Promise<CoinFlipContext> {
  const [rules, dayStart, definitions] = await Promise.all([getCasinoRules(), gameDayStart(now), getRarityDefinitions()]);
  return {
    now,
    rules,
    dayStart,
    definitions: definitions.map((d) => ({ key: d.key, sortOrder: d.sortOrder })),
    randomBytes: (n) => new Uint8Array(randomBytes(n)),
    seedKey: casinoSeedKey(),
  };
}

/**
 * Refus déjà connus avant le dernier clic, lus sans verrou pour l'interface (salon, page d'une table) : jeu coupé,
 * compte trop récent, verrou du parrainage v2, tables ouvertes ou lancers du jour au maximum. Ils s'affichent à la
 * place du bouton ou du choix de la fuda ; le serveur revérifie tout sous verrou à la pose et à la relève.
 * `counterpartyId` : créateur de la table à relever (null pour poser) ; `creating` : le plafond de tables compte.
 */
export async function playBlockFor(
  user: { id: string; isGuest: boolean; bannedAt: Date | null; createdAt: Date; role: string },
  input: { counterpartyId: string | null; creating: boolean },
  now = new Date(),
): Promise<CoinFlipErrorCode | null> {
  const rules = await getCasinoRules();
  const refusal = checkPlayer({ isGuest: user.isGuest, bannedAt: user.bannedAt, createdAt: user.createdAt, isAdmin: isStaff(user.role) }, now, rules);
  if (refusal) return refusal;
  const locked = await checkReferralLocks(prisma, { actorId: user.id, counterpartyId: input.counterpartyId, ownItems: true, mutual: true, now });
  if (locked) return locked;
  const [openTables, today] = await Promise.all([
    // Comme à la pose : une table échue pas encore balayée ne compte plus
    input.creating ? prisma.coinFlip.count({ where: { creatorId: user.id, status: "OPEN", expiresAt: { gt: now } } }) : 0,
    gameDayStart(now).then((dayStart) => flipsToday(prisma, user.id, dayStart)),
  ]);
  if (input.creating && openTables >= rules.coinflip.maxOpenTables) return "TABLE_LIMIT";
  if (today >= rules.coinflip.dailyLimit) return "DAILY_LIMIT";
  return null;
}
