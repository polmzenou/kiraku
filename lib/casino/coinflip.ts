import { casinoAccess } from "./phase";
import type { CasinoRules, CoinFlipRules } from "./rules";
import type { CoinSide } from "./fairness";

// Règles des tables de pile ou face, sans base : server/casino/coinflip-core.ts les applique sous verrou,
// l'interface s'en sert pour griser ce qui sera refusé.
// Un joueur pose une fuda et choisit 表 ou 裏 ; un autre relève avec une fuda du même palier, le serveur lance
// la pièce et le gagnant emporte les deux cartes.

export const COIN_FLIP_STATUSES = ["OPEN", "DONE", "CANCELLED", "EXPIRED"] as const;
export type CoinFlipStatus = (typeof COIN_FLIP_STATUSES)[number];

export type CoinFlipRefusal =
  /** Casino pas encore ouvert (hors aperçu admin) ou caché. */
  | "CLOSED"
  /** Pile ou face coupé dans l'admin. */
  | "DISABLED"
  | "GUEST"
  | "BANNED"
  | "TOO_NEW"
  /** Rareté retirée du jeu par l'admin. */
  | "RARITY"
  | "TABLE_LIMIT"
  | "DAILY_LIMIT"
  /** Miser son dernier exemplaire est interdit par réglage. */
  | "LAST_COPY"
  /** Dernier exemplaire : le joueur doit confirmer l'avertissement. */
  | "CONFIRM_LAST_COPY"
  /** Réservation pour soi-même, ou pour quelqu'un qui n'est ni ami ni ancien adversaire. */
  | "RESERVE_TARGET"
  | "BLOCKED"
  /** Table déjà jouée, retirée ou expirée. */
  | "NOT_OPEN"
  | "OWN_TABLE"
  /** Table réservée à un autre joueur. */
  | "RESERVED"
  /** La fuda proposée n'est pas du palier de la table. */
  | "TIER";

const HOUR = 3_600_000;

export type CasinoPlayer = { isGuest: boolean; bannedAt: Date | null; createdAt: Date; isAdmin: boolean };

/** Le joueur peut-il jouer ? Invités et comptes récents exclus ; avant l'ouverture, seuls les admins. */
export function checkPlayer(player: CasinoPlayer, now: Date, rules: CasinoRules): CoinFlipRefusal | null {
  if (!casinoAccess(rules, now.getTime(), player.isAdmin).canEnter) return "CLOSED";
  if (!rules.coinflip.enabled) return "DISABLED";
  if (player.isGuest) return "GUEST";
  if (player.bannedAt) return "BANNED";
  if (now.getTime() - player.createdAt.getTime() < rules.minAccountAgeHours * HOUR) return "TOO_NEW";
  return null;
}

export type StakeCheck = {
  rarity: string;
  /**
   * Exemplaires de la carte que possède le joueur hors du casino (tous statuts sauf CASINO), mise comprise : ceux
   * déjà en jeu sur d'autres tables ne comptent pas.
   */
  copies: number;
  confirmLastCopy: boolean;
};

/** Toute carte est misable, la dernière copie comprise si le réglage le permet, après confirmation. */
export function checkStake(s: StakeCheck, rules: CoinFlipRules): CoinFlipRefusal | null {
  if (!rules.allowedRarities.includes(s.rarity)) return "RARITY";
  if (s.copies <= 1) {
    if (!rules.lastCopyAllowed) return "LAST_COPY";
    if (!s.confirmLastCopy) return "CONFIRM_LAST_COPY";
  }
  return null;
}

export type ReserveCheck = {
  self: boolean;
  /** Ami, ou adversaire d'un lancer passé (« Revanche »). */
  eligible: boolean;
  /** Blocage dans un sens ou dans l'autre. */
  blocked: boolean;
};

export type CreateCheck = {
  stake: StakeCheck;
  /** Tables OPEN du joueur. */
  openTables: number;
  /** Lancers du jour de jeu : tables posées et tables relevées. */
  flipsToday: number;
  reserve: ReserveCheck | null;
};

/** Première raison de refuser une nouvelle table, ou null. */
export function checkCreate(c: CreateCheck, rules: CoinFlipRules): CoinFlipRefusal | null {
  if (c.reserve) {
    if (c.reserve.self) return "RESERVE_TARGET";
    if (c.reserve.blocked) return "BLOCKED";
    if (!c.reserve.eligible) return "RESERVE_TARGET";
  }
  const stake = checkStake(c.stake, rules);
  if (stake) return stake;
  if (c.openTables >= rules.maxOpenTables) return "TABLE_LIMIT";
  if (c.flipsToday >= rules.dailyLimit) return "DAILY_LIMIT";
  return null;
}

export type TableState = {
  status: CoinFlipStatus;
  expiresAt: Date;
  creatorId: string;
  reservedForId: string | null;
  tierOrder: number;
};

export function coinFlipExpiresAt(now: Date, expiryHours: number): Date {
  return new Date(now.getTime() + expiryHours * HOUR);
}

/** Table qu'on peut encore relever. */
export function isTableOpen(t: Pick<TableState, "status" | "expiresAt">, now: Date): boolean {
  return t.status === "OPEN" && t.expiresAt > now;
}

/** Table ouverte dont l'échéance est passée : le balayage rend la carte. */
export function isTableExpired(t: Pick<TableState, "status" | "expiresAt">, now: Date): boolean {
  return t.status === "OPEN" && t.expiresAt <= now;
}

export type JoinCheck = {
  table: TableState;
  joinerId: string;
  /** Palier (sortOrder) de la fuda proposée ; null si sa rareté n'est pas au registre. */
  stakeTier: number | null;
  stake: StakeCheck;
  blocked: boolean;
  flipsToday: number;
  now: Date;
};

/** Première raison de refuser une relève, ou null. */
export function checkJoin(c: JoinCheck, rules: CoinFlipRules): CoinFlipRefusal | null {
  if (!isTableOpen(c.table, c.now)) return "NOT_OPEN";
  if (c.table.creatorId === c.joinerId) return "OWN_TABLE";
  if (c.table.reservedForId !== null && c.table.reservedForId !== c.joinerId) return "RESERVED";
  if (c.blocked) return "BLOCKED";
  if (c.stakeTier === null || c.stakeTier !== c.table.tierOrder) return "TIER";
  const stake = checkStake(c.stake, rules);
  if (stake) return stake;
  if (c.flipsToday >= rules.dailyLimit) return "DAILY_LIMIT";
  return null;
}

/** Le créateur retire sa table tant qu'elle est ouverte (expirée mais pas encore balayée comprise). */
export function canCancel(t: Pick<TableState, "status" | "creatorId">, userId: string): boolean {
  return t.status === "OPEN" && t.creatorId === userId;
}

/** Le joueur invité décline une table qui lui est réservée : elle est retirée et la carte revient. */
export function canDecline(t: Pick<TableState, "status" | "expiresAt" | "reservedForId">, userId: string, now: Date): boolean {
  return isTableOpen(t, now) && t.reservedForId === userId;
}

/** Gagnant d'un lancer : le créateur si la pièce tombe sur sa face, sinon celui qui a relevé. */
export function flipWinner(t: { creatorId: string; creatorSide: CoinSide }, opponentId: string, result: CoinSide): string {
  return result === t.creatorSide ? t.creatorId : opponentId;
}
