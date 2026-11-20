import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { isStaff } from "@/lib/admin/roles";
import { maskIp } from "@/lib/anticheat/mask";
import { followDecision, ipBanKey, ipKeyPatterns, type FollowDecision, type NetworkKind } from "@/lib/anticheat/network";
import { isDeviceId } from "@/lib/anticheat/signals";
import { writeAdminLog } from "../admin/log";
import { prisma } from "../db";
import { clientIp, rateLimit } from "../ratelimit";
import { getSetting } from "../settings";
import { DEVICE_COOKIE } from "./signals";

// Bans réseau (NetworkBan) : une IP ou un appareil banni coupe tout l'accès, l'équipe exceptée.
// - Pages : AccountGate montre l'écran du ban à la place de la page (textes légaux et connexion restent lisibles).
// - Actions et routes : getCurrentUser traite le joueur comme banni (bannedAt), toutes les vérifications existantes
//   s'appliquent d'elles-mêmes.
// - Entrées sans session : ensureGuest, inscription et connexion e-mail, connexion Discord refusent explicitement.
// Un appareil banni qui revient avec une nouvelle IP la fait bannir à son tour (followDeviceWith).

type Db = PrismaClient | Prisma.TransactionClient;

export type MatchedBan = {
  id: string;
  kind: NetworkKind;
  reason: string;
  userId: string | null;
  createdById: string | null;
  createdAt: Date;
};

/** Ce que la requête en cours a de banni : les bans trouvés, la clé de son IP et son appareil. */
export type RequestBan = { bans: MatchedBan[]; ipKey: string | null; device: string | null; since: Date };

/** Un ban automatique expire ; les autres valent jusqu'à leur levée (expiresAt vide). */
export const activeBan = (now: Date): Prisma.NetworkBanWhereInput => ({ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] });

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

/**
 * Ban réseau de la requête en cours (son IP, son cookie d'appareil), lu une fois par requête. null : rien de banni.
 * Le cookie n'est que lu ici : il est posé par le relevé des multi-comptes (server/anticheat/signals.ts).
 */
export const requestNetworkBan = cache(async (): Promise<RequestBan | null> => {
  const [ip, jar] = await Promise.all([clientIp(), cookies()]);
  const raw = jar.get(DEVICE_COOKIE.name)?.value;
  const target = { ipKey: ipBanKey(ip), device: isDeviceId(raw) ? raw : null };
  const bans = await findNetworkBans(prisma, target, new Date());
  if (bans.length === 0) return null;
  const since = new Date(Math.min(...bans.map((b) => b.createdAt.getTime())));
  return { bans, ...target, since };
});

/** Le ban de la requête coupe-t-il ce joueur ? Jamais un compte de l'équipe (ADMIN, DEV). */
export function blocks(ban: RequestBan | null, role: string | null | undefined): ban is RequestBan {
  return ban !== null && !isStaff(role);
}

/**
 * Accès refusé par un ban réseau : compte la tentative et, si un appareil banni arrive d'une IP qui ne l'est pas,
 * fait suivre le ban. Au plus une fois par 10 minutes pour un même réseau. Ne lève jamais : appelée après la
 * réponse (after()), un échec ne finit que dans les logs.
 */
export async function noteBlocked(ban: RequestBan): Promise<void> {
  try {
    const ids = ban.bans.map((b) => b.id).sort();
    const { success } = await rateLimit(`netban:${ids.join(",")}:${ban.ipKey ?? "-"}`, { limit: 1, windowSeconds: 600 }, { store: "memory" });
    if (!success) return;
    const now = new Date();
    await prisma.networkBan.updateMany({ where: { id: { in: ids } }, data: { hits: { increment: 1 }, lastHitAt: now } });
    const device = ban.bans.find((b) => b.kind === "DEVICE");
    if (device && ban.device && ban.ipKey && !ban.bans.some((b) => b.kind === "IP")) {
      await followDeviceWith(prisma, { deviceBan: device, device: ban.device, ipKey: ban.ipKey, now });
    }
  } catch (e) {
    console.error("[bans réseau] tentative", e instanceof Error ? e.message : e);
  }
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

/**
 * Le ban suit l'appareil : la nouvelle IP d'un appareil banni est bannie à son tour (source AUTO, expiration
 * multiAccount.autoBanDays), si personne de l'équipe ne l'utilise et qu'elle ne coupe pas d'autres comptes actifs
 * (ceux qui ont déjà servi sur l'appareil banni ne comptent pas : ce sont les siens). Deux accès simultanés ne
 * créent qu'un ban (index unique).
 */
export async function followDeviceWith(db: Db, input: { deviceBan: MatchedBan; device: string; ipKey: string; now: Date }): Promise<FollowDecision> {
  const [enabled, maxOthers, days, perDevice, accounts, autoBans] = await Promise.all([
    getSetting("multiAccount.followDevice"),
    getSetting("multiAccount.autoBanMaxOthers"),
    getSetting("multiAccount.autoBanDays"),
    getSetting("multiAccount.autoBanPerDevice"),
    accountsOnKeys(db, [{ kind: "IP", key: input.ipKey }, { kind: "DEVICE", key: input.device }]),
    db.networkBan.count({ where: { parentId: input.deviceBan.id } }),
  ]);
  const onIp = accounts.get(keyId("IP", input.ipKey)) ?? [];
  const onDevice = new Set((accounts.get(keyId("DEVICE", input.device)) ?? []).map((a) => a.userId));
  const decision = followDecision({
    enabled,
    ipKey: input.ipKey,
    staffSeen: onIp.some((a) => isStaff(a.role)),
    othersActive: onIp.filter((a) => isActiveAccount(a) && !onDevice.has(a.userId)).length,
    maxOthers,
    autoBans,
    perDevice,
  });
  if (decision !== "FOLLOW") return decision;
  const { count } = await db.networkBan.createMany({
    data: [{
      kind: "IP",
      value: input.ipKey,
      source: "AUTO",
      reason: input.deviceBan.reason,
      userId: input.deviceBan.userId,
      createdById: input.deviceBan.createdById,
      parentId: input.deviceBan.id,
      expiresAt: new Date(input.now.getTime() + days * 86_400_000),
    }],
    skipDuplicates: true,
  });
  // Journal : au nom de l'admin qui a banni l'appareil (une action système n'a pas d'auteur à elle)
  if (count === 1 && input.deviceBan.createdById) {
    await writeAdminLog(db, {
      adminId: input.deviceBan.createdById,
      action: "NETWORK_BAN_AUTO",
      targetType: "User",
      targetId: input.deviceBan.userId,
      after: { kind: "IP", value: maskIp(input.ipKey), parent: input.deviceBan.id, days },
    });
  }
  return decision;
}
