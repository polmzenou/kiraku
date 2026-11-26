// Bans réseau, cœur des écritures et des lectures (client injecté : serveur, transaction ou test). La barrière de la
// requête (IP, cookie d'appareil, écran) vit dans network-ban.ts.
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { isStaff } from "@/lib/admin/roles";
import { maskIp, shortDevice } from "@/lib/anticheat/mask";
import { banState, followDecision, ipBanKey, ipKeyPatterns, signalBanKey, type BanState, type FollowDecision, type NetworkKind } from "@/lib/anticheat/network";
import { writeAdminLog } from "../admin/log";
import { banAccountWith } from "../admin/users-core";
import { withdrawCasinoFor } from "../casino/coinflip-core";
import { withdrawMarketFor } from "../market/withdraw";
import { lockPlayers } from "../social/lock";

type Db = PrismaClient | Prisma.TransactionClient;

const json = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v));
const TX = { maxWait: 10_000, timeout: 20_000 };

export type NetworkBanErrorCode =
  | "FORBIDDEN" // plus admin (revérifié sous verrou)
  | "NOT_FOUND" // compte ou ban disparu
  | "SELF" // on ne se bannit pas soi-même
  | "STAFF_TARGET" // un compte de l'équipe ne se bannit pas ici
  | "NOTHING" // rien à bannir
  | "REFUSED" // une IP ou un appareil choisi ne peut pas l'être (équipe, privée, trop partagée)
  | "NOT_AUTO"; // seul un ban automatique se rend définitif

export class NetworkBanError extends Error {
  constructor(readonly code: NetworkBanErrorCode) {
    super(code);
  }
}

/** Valeur montrable d'une clé (journal, comptes rendus) : jamais l'IP ni l'appareil en entier. */
export const maskedKey = (kind: NetworkKind, key: string) => (kind === "IP" ? maskIp(key) : shortDevice(key));

/** Un ban automatique expire ; les autres valent jusqu'à leur levée (expiresAt vide). */
export const activeBan = (now: Date): Prisma.NetworkBanWhereInput => ({ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] });

export type MatchedBan = {
  id: string;
  kind: NetworkKind;
  reason: string;
  userId: string | null;
  createdById: string | null;
  createdAt: Date;
};

/** Bans actifs qui visent cette IP (clé) ou cet appareil : une requête sur l'index unique (kind, value). */
export async function findNetworkBans(db: Db, target: { ipKey: string | null; device: string | null }, now: Date): Promise<MatchedBan[]> {
  const targets: Prisma.NetworkBanWhereInput[] = [
    ...(target.ipKey ? [{ kind: "IP" as const, value: target.ipKey }] : []),
    ...(target.device ? [{ kind: "DEVICE" as const, value: target.device }] : []),
  ];
  if (targets.length === 0) return [];
  return db.networkBan.findMany({
    where: { AND: [{ OR: targets }, activeBan(now)] },
    select: { id: true, kind: true, reason: true, userId: true, createdById: true, createdAt: true },
  });
}

/** Un compte qui a utilisé une IP ou un appareil (relevés UserSignal). */
export type KeyAccount = { userId: string; role: string; banned: boolean; anonymized: boolean };

export const keyId = (kind: NetworkKind, key: string) => `${kind}:${key}`;

/** Ni banni ni anonymisé : un ban réseau le couperait. */
export const isActiveAccount = (a: KeyAccount) => !a.banned && !a.anonymized;

/**
 * Comptes qui ont utilisé chaque IP (clé) ou appareil, d'après les relevés encore conservés. Une IPv6 relevée est
 * une adresse complète : préfiltre SQL sur son début, puis comparaison exacte des clés /64.
 */
export async function accountsOnKeys(db: Db, keys: readonly { kind: NetworkKind; key: string }[]): Promise<Map<string, KeyAccount[]>> {
  const out = new Map(keys.map((k) => [keyId(k.kind, k.key), [] as KeyAccount[]]));
  const devices = keys.filter((k) => k.kind === "DEVICE").map((k) => k.key);
  const ipKeys = new Set(keys.filter((k) => k.kind === "IP").map((k) => k.key));
  const patterns = [...ipKeys].flatMap(ipKeyPatterns);
  if (devices.length === 0 && patterns.length === 0) return out;
  const rows = await db.$queryRaw<{ userId: string; kind: NetworkKind; value: string; role: string; bannedAt: Date | null; anonymizedAt: Date | null }[]>`
    SELECT DISTINCT s."userId", s.kind::text AS kind, s.value, u.role::text AS role, u."bannedAt", u."anonymizedAt"
    FROM "UserSignal" s JOIN "User" u ON u.id = s."userId"
    WHERE (s.kind = 'DEVICE' AND s.value = ANY(${devices}::text[]))
       OR (s.kind = 'IP' AND s.value LIKE ANY(${patterns}::text[]))`;
  for (const r of rows) {
    const key = r.kind === "DEVICE" ? r.value : ipBanKey(r.value);
    if (!key || (r.kind === "IP" && !ipKeys.has(key))) continue;
    const list = out.get(keyId(r.kind, key));
    if (!list || list.some((a) => a.userId === r.userId)) continue;
    list.push({ userId: r.userId, role: r.role, banned: r.bannedAt !== null, anonymized: r.anonymizedAt !== null });
  }
  return out;
}

/** Une IP (clé /64 pour une IPv6) ou un appareil relevé pour des comptes : ses relevés, ses comptes, sa dernière vue. */
export type NetworkKey = { kind: NetworkKind; key: string; signalIds: string[]; userIds: string[]; lastSeenAt: Date };

/** IP et appareils relevés pour ces comptes, regroupés par clé (plusieurs adresses d'un même /64 : une seule clé). */
export async function networkKeysOf(db: Db, userIds: readonly string[]): Promise<NetworkKey[]> {
  const signals = await db.userSignal.findMany({
    where: { userId: { in: [...userIds] } },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, userId: true, kind: true, value: true, lastSeenAt: true },
  });
  const keys = new Map<string, NetworkKey>();
  for (const s of signals) {
    const key = signalBanKey(s.kind, s.value);
    if (!key) continue;
    const entry = keys.get(keyId(s.kind, key)) ?? { kind: s.kind, key, signalIds: [], userIds: [], lastSeenAt: s.lastSeenAt };
    entry.signalIds.push(s.id);
    // Du plus récent au plus ancien : le premier compte est celui qui l'a utilisée en dernier
    if (!entry.userIds.includes(s.userId)) entry.userIds.push(s.userId);
    keys.set(keyId(s.kind, key), entry);
  }
  return [...keys.values()];
}

/** Une clé et son état pour un ban visant `targets` : ban en place, comptes actifs coupés en plus. */
export type KeyStateView = NetworkKey & { state: BanState; banId: string | null; others: string[] };

export async function keyStates(db: Db, keys: readonly NetworkKey[], targets: ReadonlySet<string>, sharedIpCap: number, now: Date): Promise<KeyStateView[]> {
  if (keys.length === 0) return [];
  const [accounts, bans] = await Promise.all([
    accountsOnKeys(db, keys),
    db.networkBan.findMany({
      where: { AND: [{ OR: keys.map((k) => ({ kind: k.kind, value: k.key })) }, activeBan(now)] },
      select: { id: true, kind: true, value: true },
    }),
  ]);
  return keys.map((k) => {
    const list = accounts.get(keyId(k.kind, k.key)) ?? [];
    const others = list.filter((a) => !targets.has(a.userId) && isActiveAccount(a)).map((a) => a.userId);
    const banId = bans.find((b) => b.kind === k.kind && b.value === k.key)?.id ?? null;
    const state = banState(
      { kind: k.kind, key: k.key, banned: banId !== null, staffSeen: list.some((a) => isStaff(a.role)), accounts: list.length, othersActive: others.length },
      sharedIpCap,
    );
    return { ...k, state, banId, others };
  });
}

/**
 * Un ban automatique expiré garde sa ligne jusqu'au ménage du cron : elle est retirée avant d'en poser un neuf sur la
 * même clé (l'index unique le sauterait sinon sans rien dire).
 */
async function clearExpired(db: Db, keys: readonly { kind: NetworkKind; key: string }[], now: Date) {
  if (keys.length === 0) return;
  await db.networkBan.deleteMany({ where: { expiresAt: { lte: now }, OR: keys.map((k) => ({ kind: k.kind, value: k.key })) } });
}

/** Admin non banni, revérifié dans la transaction : une session ouverte ne conserve pas des droits retirés. */
async function assertAdmin(tx: Prisma.TransactionClient, adminId: string) {
  const actor = await tx.user.findUnique({ where: { id: adminId }, select: { role: true, bannedAt: true } });
  if (!actor || actor.role !== "ADMIN" || actor.bannedAt) throw new NetworkBanError("FORBIDDEN");
}

const REFUSED_STATES: readonly BanState[] = ["STAFF", "PRIVATE", "CAP"];

/**
 * Fiche joueur : bannit les IP et appareils choisis parmi les relevés de ce compte (propriété vérifiée ici), et le
 * compte si demandé. Une IP partagée avec d'autres comptes actifs se bannit si l'admin l'a cochée (l'écran les
 * nomme) ; une IP de l'équipe, privée ou trop partagée jamais. Une clé déjà bannie entre-temps est sautée.
 */
export async function banNetworkWith(
  db: PrismaClient,
  input: { adminId: string; userId: string; signalIds: readonly string[]; banAccount: boolean; reason: string; now: Date; sharedIpCap: number },
): Promise<{ bans: number; account: boolean }> {
  const result = await db.$transaction(async (tx) => {
    await lockPlayers(tx, [input.adminId, input.userId]);
    await assertAdmin(tx, input.adminId);
    const target = await tx.user.findUnique({ where: { id: input.userId }, select: { id: true, role: true } });
    if (!target) throw new NetworkBanError("NOT_FOUND");
    if (target.id === input.adminId) throw new NetworkBanError("SELF");
    if (isStaff(target.role)) throw new NetworkBanError("STAFF_TARGET");

    const chosen = new Set(input.signalIds);
    const keys = (await networkKeysOf(tx, [target.id])).filter((k) => k.signalIds.some((id) => chosen.has(id)));
    if (keys.length === 0 && !input.banAccount) throw new NetworkBanError("NOTHING");
    const states = await keyStates(tx, keys, new Set([target.id]), input.sharedIpCap, input.now);
    if (states.some((s) => REFUSED_STATES.includes(s.state))) throw new NetworkBanError("REFUSED");
    const toBan = states.filter((s) => s.state === "OK" || s.state === "SHARED");

    await clearExpired(tx, toBan, input.now);
    await tx.networkBan.createMany({
      data: toBan.map((s) => ({ kind: s.kind, value: s.key, source: "MANUAL" as const, reason: input.reason, userId: target.id, createdById: input.adminId })),
      skipDuplicates: true,
    });
    const account = input.banAccount ? await banAccountWith(tx, target.id, input.now) : false;
    await writeAdminLog(tx, {
      adminId: input.adminId,
      action: "USER_NETWORK_BAN",
      targetType: "User",
      targetId: target.id,
      after: json({ values: { account, bans: toBan.map((s) => ({ kind: s.kind, value: maskedKey(s.kind, s.key), cut: s.others.length })) }, reason: input.reason }),
    });
    return { bans: toBan.length, account };
  }, TX);
  // Comme pour l'édition du compte : ses tables de pile ou face se ferment après coup
  if (result.account) {
    await withdrawCasinoFor(db, input.userId, input.now);
    await withdrawMarketFor(db, { userId: input.userId, adminId: input.adminId, now: input.now });
  }
  return result;
}

export type SkippedKey = { kind: NetworkKind; value: string; state: BanState };

/**
 * Groupe suspect de /admin/multi-comptes : bannit tous ses comptes, et chacune de leurs IP et chacun de leurs
 * appareils qui ne coupe personne d'autre. Ce qui est partagé hors du groupe, utilisé par l'équipe, privé ou trop
 * partagé est sauté et rendu à l'admin (il peut le bannir depuis une fiche joueur, en connaissance de cause).
 */
export async function banGroupWith(
  db: PrismaClient,
  input: { adminId: string; userIds: readonly string[]; reason: string; now: Date; sharedIpCap: number },
): Promise<{ accounts: number; bans: number; skipped: SkippedKey[] }> {
  const result = await db.$transaction(async (tx) => {
    await lockPlayers(tx, [input.adminId, ...input.userIds]);
    await assertAdmin(tx, input.adminId);
    return banGroupInTx(tx, input);
  }, TX);
  for (const id of result.banned) {
    await withdrawCasinoFor(db, id, input.now);
    await withdrawMarketFor(db, { userId: id, adminId: input.adminId, now: input.now });
  }
  return { accounts: result.banned.length, bans: result.bans, skipped: result.skipped };
}

/**
 * Bannissement d'un groupe dans la transaction de l'appelant, qui a vérifié le droit de l'auteur (ADMIN pour
 * /admin/multi-comptes ; ADMIN ou DEV pour la file « À vérifier » du parrainage) et verrouillé les comptes. L'appelant
 * retire ensuite les tables de pile ou face des comptes bannis (withdrawCasinoFor), hors de la transaction.
 */
export async function banGroupInTx(
  tx: Prisma.TransactionClient,
  input: { adminId: string; userIds: readonly string[]; reason: string; now: Date; sharedIpCap: number },
): Promise<{ banned: string[]; bans: number; skipped: SkippedKey[] }> {
  const ids = [...new Set(input.userIds)];
  if (ids.includes(input.adminId)) throw new NetworkBanError("SELF");
  const users = await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, role: true } });
  if (users.length !== ids.length) throw new NetworkBanError("NOT_FOUND");
  if (users.some((u) => isStaff(u.role))) throw new NetworkBanError("STAFF_TARGET");

  const states = await keyStates(tx, await networkKeysOf(tx, ids), new Set(ids), input.sharedIpCap, input.now);
  const toBan = states.filter((s) => s.state === "OK");
  await clearExpired(tx, toBan, input.now);
  await tx.networkBan.createMany({
    data: toBan.map((s) => ({ kind: s.kind, value: s.key, source: "GROUP" as const, reason: input.reason, userId: s.userIds[0], createdById: input.adminId })),
    skipDuplicates: true,
  });
  const banned: string[] = [];
  for (const id of ids) {
    const account = await banAccountWith(tx, id, input.now);
    if (account) banned.push(id);
    const own = toBan.filter((s) => s.userIds.includes(id));
    await writeAdminLog(tx, {
      adminId: input.adminId,
      action: "USER_NETWORK_BAN",
      targetType: "User",
      targetId: id,
      after: json({ values: { account, group: ids.length, bans: own.map((s) => ({ kind: s.kind, value: maskedKey(s.kind, s.key) })) }, reason: input.reason }),
    });
  }
  const skipped = states
    .filter((s) => s.state !== "OK" && s.state !== "BANNED")
    .map((s): SkippedKey => ({ kind: s.kind, value: maskedKey(s.kind, s.key), state: s.state }));
  return { banned, bans: toBan.length, skipped };
}

/** Lève un ban (la ligne part : l'IP n'est plus gardée) ; lever un appareil lève les IP qu'il a fait bannir. */
export async function liftNetworkBanWith(db: PrismaClient, input: { adminId: string; banId: string; reason: string }): Promise<void> {
  await db.$transaction(async (tx) => {
    await assertAdmin(tx, input.adminId);
    const ban = await tx.networkBan.findUnique({
      where: { id: input.banId },
      select: { id: true, kind: true, value: true, source: true, userId: true, _count: { select: { children: true } } },
    });
    if (!ban) throw new NetworkBanError("NOT_FOUND");
    const { count } = await tx.networkBan.deleteMany({ where: { id: ban.id } });
    if (count !== 1) throw new NetworkBanError("NOT_FOUND");
    await writeAdminLog(tx, {
      adminId: input.adminId,
      action: "USER_NETWORK_UNBAN",
      targetType: ban.userId ? "User" : "NetworkBan",
      targetId: ban.userId ?? ban.id,
      before: json({ kind: ban.kind, value: maskedKey(ban.kind, ban.value), source: ban.source, followed: ban._count.children }),
      after: json({ reason: input.reason }),
    });
  }, TX);
}

/** Rend définitif un ban automatique : plus d'expiration, et il ne suit plus l'appareil (il survit à sa levée). */
export async function keepNetworkBanWith(db: PrismaClient, input: { adminId: string; banId: string; reason: string }): Promise<void> {
  await db.$transaction(async (tx) => {
    await assertAdmin(tx, input.adminId);
    const ban = await tx.networkBan.findUnique({ where: { id: input.banId }, select: { id: true, kind: true, value: true, source: true, userId: true } });
    if (!ban) throw new NetworkBanError("NOT_FOUND");
    if (ban.source !== "AUTO") throw new NetworkBanError("NOT_AUTO");
    await tx.networkBan.update({ where: { id: ban.id }, data: { expiresAt: null, parentId: null } });
    await writeAdminLog(tx, {
      adminId: input.adminId,
      action: "USER_NETWORK_KEEP",
      targetType: ban.userId ? "User" : "NetworkBan",
      targetId: ban.userId ?? ban.id,
      after: json({ values: { kind: ban.kind, value: maskedKey(ban.kind, ban.value) }, reason: input.reason }),
    });
  }, TX);
}

/** Ménage quotidien (cron des comptes) : bans automatiques expirés, pour que leur IP ne reste pas en base. */
export async function purgeExpiredNetworkBans(db: Db, now: Date): Promise<number> {
  const { count } = await db.networkBan.deleteMany({ where: { expiresAt: { lte: now } } });
  return count;
}

/** Réglages du ban qui suit l'appareil (multiAccount.*), lus par l'appelant. */
export type FollowRules = { enabled: boolean; maxOthers: number; days: number; perDevice: number };

/**
 * Le ban suit l'appareil : la nouvelle IP d'un appareil banni est bannie à son tour (source AUTO, expiration), si
 * personne de l'équipe ne l'utilise et qu'elle ne coupe pas d'autres comptes actifs (ceux qui ont déjà servi sur
 * l'appareil banni ne comptent pas : ce sont les siens). Deux accès simultanés ne créent qu'un ban (index unique).
 */
export async function followDeviceWith(
  db: Db,
  input: { deviceBan: MatchedBan; device: string; ipKey: string; now: Date },
  rules: FollowRules,
): Promise<FollowDecision> {
  const [accounts, autoBans] = await Promise.all([
    accountsOnKeys(db, [{ kind: "IP", key: input.ipKey }, { kind: "DEVICE", key: input.device }]),
    db.networkBan.count({ where: { parentId: input.deviceBan.id } }),
  ]);
  const onIp = accounts.get(keyId("IP", input.ipKey)) ?? [];
  const onDevice = new Set((accounts.get(keyId("DEVICE", input.device)) ?? []).map((a) => a.userId));
  const decision = followDecision({
    enabled: rules.enabled,
    ipKey: input.ipKey,
    staffSeen: onIp.some((a) => isStaff(a.role)),
    othersActive: onIp.filter((a) => isActiveAccount(a) && !onDevice.has(a.userId)).length,
    maxOthers: rules.maxOthers,
    autoBans,
    perDevice: rules.perDevice,
  });
  if (decision !== "FOLLOW") return decision;
  await clearExpired(db, [{ kind: "IP", key: input.ipKey }], input.now);
  const { count } = await db.networkBan.createMany({
    data: [{
      kind: "IP",
      value: input.ipKey,
      source: "AUTO",
      reason: input.deviceBan.reason,
      userId: input.deviceBan.userId,
      createdById: input.deviceBan.createdById,
      parentId: input.deviceBan.id,
      expiresAt: new Date(input.now.getTime() + rules.days * 86_400_000),
    }],
    skipDuplicates: true,
  });
  // Journal : au nom de l'admin qui a banni l'appareil (une action automatique n'a pas d'auteur à elle)
  if (count === 1 && input.deviceBan.createdById) {
    await writeAdminLog(db, {
      adminId: input.deviceBan.createdById,
      action: "USER_NETWORK_AUTO",
      targetType: input.deviceBan.userId ? "User" : "NetworkBan",
      targetId: input.deviceBan.userId ?? input.deviceBan.id,
      after: json({ values: { kind: "IP", value: maskIp(input.ipKey), parent: input.deviceBan.id, days: rules.days } }),
    });
  }
  return decision;
}
