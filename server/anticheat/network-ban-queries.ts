import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { ipBanKey, selectionOf, type BanState, type NetworkKind } from "@/lib/anticheat/network";
import { prisma } from "../db";
import { getSetting } from "../settings";
import { activeBan, keyStates, networkKeysOf } from "./network-ban-core";

// Lectures des bans réseau pour l'admin : fiche joueur, /admin/multi-comptes et sa liste des bans. Les valeurs sortent
// en clair : la page les masque pour le DEV (maskedKey) avant le rendu.

export type NetworkBanRow = {
  kind: NetworkKind;
  value: string;
  state: BanState;
  selectable: boolean;
  checked: boolean;
  signalIds: string[];
  lastSeenAt: Date;
  /** Comptes actifs qu'un ban couperait en plus (5 au plus), et leur nombre. */
  others: { id: string; username: string }[];
  othersCount: number;
};

/** Fiche joueur : ses IP (par clé de ban) et appareils, avec l'état de chacun pour un ban. */
export async function networkBanRows(userId: string, now = new Date()): Promise<NetworkBanRow[]> {
  const [cap, keys] = await Promise.all([getSetting("multiAccount.sharedIpCap"), networkKeysOf(prisma, [userId])]);
  const states = await keyStates(prisma, keys, new Set([userId]), cap, now);
  const shown = [...new Set(states.flatMap((s) => s.others.slice(0, 5)))];
  const users = shown.length === 0 ? [] : await prisma.user.findMany({ where: { id: { in: shown } }, select: { id: true, username: true } });
  const names = new Map(users.map((u) => [u.id, u.username]));
  return states.map((s) => ({
    kind: s.kind,
    value: s.key,
    state: s.state,
    ...selectionOf(s.state),
    signalIds: s.signalIds,
    lastSeenAt: s.lastSeenAt,
    others: s.others.slice(0, 5).flatMap((id) => {
      const username = names.get(id);
      return username ? [{ id, username }] : [];
    }),
    othersCount: s.others.length,
  }));
}

export type NetworkBanItem = {
  id: string;
  kind: NetworkKind;
  value: string;
  source: "MANUAL" | "GROUP" | "AUTO";
  reason: string;
  user: { id: string; username: string } | null;
  createdBy: string | null;
  createdAt: Date;
  expiresAt: Date | null;
  hits: number;
  lastHitAt: Date | null;
  /** Ban d'IP : appareils déjà connus qu'il a bloqués (BLOCKED_DEVICES_MAX au plus). */
  devices: number;
  /** AUTO : l'appareil suivi. */
  parent: { kind: NetworkKind; value: string } | null;
  /** IP qu'un appareil banni a fait bannir (exemptions non comptées). */
  followed: number;
};

/**
 * Recherche d'une IP dans les bans (plainte d'un joueur) : une adresse complète trouve le ban de sa clé (IPv4 exacte,
 * ou son /64) ; sinon le début de la clé, en minuscules.
 */
function ipFilter(search: string): Prisma.NetworkBanWhereInput {
  const text = search.trim().toLowerCase();
  const key = ipBanKey(text);
  return { kind: "IP", value: key ? key : { startsWith: text } };
}

/** Bans en place, les plus récents d'abord ; `userId` : ceux venus de ce compte ; `ip` : recherche de l'admin. */
export async function listNetworkBans(options: { userId?: string; ip?: string; take: number }, now = new Date()): Promise<NetworkBanItem[]> {
  const rows = await prisma.networkBan.findMany({
    where: { AND: [activeBan(now), options.userId ? { userId: options.userId } : {}, options.ip ? ipFilter(options.ip) : {}] },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: options.take,
    select: {
      id: true,
      kind: true,
      value: true,
      source: true,
      reason: true,
      createdAt: true,
      expiresAt: true,
      hits: true,
      lastHitAt: true,
      deviceTags: true,
      user: { select: { id: true, username: true } },
      createdBy: { select: { username: true } },
      parent: { select: { kind: true, value: true } },
      _count: { select: { children: { where: { liftedAt: null } } } },
    },
  });
  return rows.map(({ createdBy, _count, deviceTags, ...r }) => ({ ...r, createdBy: createdBy?.username ?? null, devices: deviceTags.length, followed: _count.children }));
}

/** Nombre de bans en place (lien de /admin/multi-comptes). */
export function countNetworkBans(now = new Date()): Promise<number> {
  return prisma.networkBan.count({ where: activeBan(now) });
}

/** Clés d'IP bannies (badge « Bannie » des IP partagées de /admin/multi-comptes). */
export async function bannedIpKeys(now = new Date()): Promise<Set<string>> {
  const rows = await prisma.networkBan.findMany({ where: { kind: "IP", ...activeBan(now) }, select: { value: true } });
  return new Set(rows.map((r) => r.value));
}
