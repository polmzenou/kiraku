import "server-only";
import { cache } from "react";
import { isFrozen } from "@/lib/account/deletion";
import { isStaff } from "@/lib/admin/roles";
import { isKyaraRejectCode, type KyaraImportStatus } from "@/lib/kyara/codes";
import { playerKyaraPhase, type PlayerKyaraPhase } from "@/lib/kyara/phase";
import { KYARA_SETTING_KEYS, kyaraRulesFrom, type KyaraRules } from "@/lib/kyara/rules";
import { parseImportSummary, type KyaraImportSummary } from "@/lib/kyara/summary";
import { kyaraEligibility } from "@/lib/kyara/window";
import type { SettingValue } from "@/lib/settings/defaults";
import { prisma } from "../db";
import { getSetting } from "../settings";
import { previewImportWith } from "./import-core";

// Lectures de l'import Kyara (pages du joueur et de l'équipe). Les écritures sont dans import-core.ts.

export const getKyaraRules = cache(async (): Promise<KyaraRules> => {
  const values = await Promise.all(KYARA_SETTING_KEYS.map((key) => getSetting(key)));
  const byKey = new Map<string, unknown>(KYARA_SETTING_KEYS.map((key, i) => [key, values[i]]));
  return kyaraRulesFrom((key) => byKey.get(key) as SettingValue<typeof key>);
});

/** Ce que les lectures du joueur demandent à son compte (getCurrentUser). */
export type KyaraUser = {
  id: string;
  role: string;
  isGuest: boolean;
  registeredAt: Date | null;
  createdAt: Date;
  bannedAt: Date | null;
  deletionRequestedAt: Date | null;
  anonymizedAt: Date | null;
};

const ACTIVE = ["PENDING", "READY", "DONE"] as const;

export type KyaraRequestView = {
  id: string;
  kyaraUserId: string;
  status: KyaraImportStatus;
  requestedAt: Date;
  rejectNote: string | null;
  grantedCards: number | null;
  grantedZeni: number | null;
  zeniRaw: number | null;
  appliedAt: Date | null;
  summary: KyaraImportSummary | null;
};

export type KyaraPlayerView = { phase: PlayerKyaraPhase; rules: KyaraRules; request: KyaraRequestView | null };

/** Page /compte/import-kyara : phase du joueur, réglages utiles à l'affichage et sa dernière demande. */
export async function playerKyaraView(user: KyaraUser, now: Date): Promise<KyaraPlayerView> {
  const [rules, discord, latest] = await Promise.all([
    getKyaraRules(),
    prisma.account.findFirst({ where: { userId: user.id, provider: "discord" }, select: { providerAccountId: true } }),
    prisma.kyaraImport.findFirst({
      where: { userId: user.id },
      orderBy: { requestedAt: "desc" },
      select: {
        id: true,
        kyaraUserId: true,
        status: true,
        requestedAt: true,
        rejectCode: true,
        rejectNote: true,
        grantedCards: true,
        grantedZeni: true,
        zeniRaw: true,
        appliedAt: true,
        summary: true,
      },
    }),
  ]);
  // Ce Discord a-t-il déjà servi ailleurs (compte supprimé compris, dont la ligne n'a plus de joueur) ?
  const usedElsewhere =
    discord !== null &&
    (await prisma.kyaraImport.count({
      where: { discordId: discord.providerAccountId, status: { in: [...ACTIVE] }, OR: [{ userId: null }, { userId: { not: user.id } }] },
    })) > 0;
  const eligibility = kyaraEligibility(
    {
      isGuest: user.isGuest,
      registeredAt: user.registeredAt,
      createdAt: user.createdAt,
      discordLinked: discord !== null,
      unavailable: user.bannedAt !== null || isFrozen(user),
      staff: isStaff(user.role),
    },
    rules,
    now.getTime(),
  );
  const row = latest ? { status: latest.status, rejectCode: isKyaraRejectCode(latest.rejectCode) ? latest.rejectCode : null } : null;
  return {
    phase: playerKyaraPhase(eligibility, row, usedElsewhere),
    rules,
    request: latest
      ? {
          id: latest.id,
          kyaraUserId: latest.kyaraUserId,
          status: latest.status,
          requestedAt: latest.requestedAt,
          rejectNote: latest.rejectNote,
          grantedCards: latest.grantedCards,
          grantedZeni: latest.grantedZeni,
          zeniRaw: latest.zeniRaw,
          appliedAt: latest.appliedAt,
          summary: parseImportSummary(latest.summary),
        }
      : null,
  };
}

export type KyaraBanner = { kind: "OPEN" | "GUEST" | "NO_DISCORD"; deadline: number | null };

/**
 * Bannière de l'accueil : seulement quand le joueur peut agir. Hors fenêtre, aucune requête (réglages en cache et
 * compte déjà lu) ; dans la fenêtre, deux lectures (demande déjà faite, Discord lié).
 */
export async function kyaraBannerFor(user: KyaraUser | null, now: number): Promise<KyaraBanner | null> {
  if (!user || user.bannedAt !== null || isFrozen(user)) return null;
  const rules = await getKyaraRules();
  const e = kyaraEligibility(
    { isGuest: user.isGuest, registeredAt: user.registeredAt, createdAt: user.createdAt, discordLinked: true, unavailable: false, staff: false },
    rules,
    now,
  );
  if (!e.ok) return e.reason === "GUEST" ? { kind: "GUEST", deadline: null } : null;
  const [request, discord] = await Promise.all([
    prisma.kyaraImport.findFirst({ where: { userId: user.id, status: { in: [...ACTIVE] } }, select: { id: true } }),
    prisma.account.findFirst({ where: { userId: user.id, provider: "discord" }, select: { id: true } }),
  ]);
  if (request) return null;
  return { kind: discord ? "OPEN" : "NO_DISCORD", deadline: e.deadline };
}

/**
 * Tuile du Compte : une demande existe (à suivre ou à relire), ou le joueur est dans sa fenêtre. Au plus une
 * lecture ; l'équipe la voit aussi hors lancement (demande de test).
 */
export async function kyaraTileVisible(user: KyaraUser, now: number): Promise<boolean> {
  const rules = await getKyaraRules();
  const staff = isStaff(user.role);
  if ((await prisma.kyaraImport.count({ where: { userId: user.id, status: { not: "CANCELLED" } } })) > 0) return true;
  if (!rules.enabled && !staff) return false;
  const e = kyaraEligibility(
    { isGuest: user.isGuest, registeredAt: user.registeredAt, createdAt: user.createdAt, discordLinked: true, unavailable: user.bannedAt !== null || isFrozen(user), staff },
    rules,
    now,
  );
  return e.ok;
}

export const QUEUE_TABS = ["PENDING", "READY", "DONE", "REJECTED"] as const;
export type QueueTab = (typeof QUEUE_TABS)[number];

/** File de /admin/kyara : demandes d'un statut, les plus anciennes d'abord (les traitées, les plus récentes). */
export async function kyaraQueue(tab: QueueTab, take = 50) {
  return prisma.kyaraImport.findMany({
    where: { status: tab },
    orderBy: { requestedAt: tab === "PENDING" || tab === "READY" ? "asc" : "desc" },
    take,
    select: {
      id: true,
      kyaraUserId: true,
      requestedAt: true,
      deadlineAt: true,
      receivedAt: true,
      appliedAt: true,
      rejectCode: true,
      snapshotCards: true,
      discordVerified: true,
      grantedCards: true,
      grantedZeni: true,
      reopenCount: true,
      user: { select: { id: true, username: true, createdAt: true } },
    },
  });
}

/** Fiche d'une demande pour l'équipe, avec l'aperçu recalculé si elle est lue. */
export async function kyaraImportDetail(importId: string) {
  const row = await prisma.kyaraImport.findUnique({
    where: { id: importId },
    include: { user: { select: { id: true, username: true, createdAt: true, registeredAt: true, bannedAt: true } } },
  });
  if (!row) return null;
  const [preview, others] = await Promise.all([
    row.status === "READY" ? previewImportWith(prisma, row.id) : null,
    // Autres demandes sur ce profil Kyara (une adresse collée par plusieurs comptes)
    prisma.kyaraImport.count({ where: { kyaraUserId: row.kyaraUserId, id: { not: row.id }, status: { in: ["PENDING", "READY", "DONE"] } } }),
  ]);
  return { row, preview: preview?.plan ?? null, sameProfile: others };
}

/** Tableau de bord de /admin/kyara : demandes par statut et plus ancienne demande en attente. */
export async function kyaraAdminOverview() {
  const [groups, oldest] = await Promise.all([
    prisma.kyaraImport.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.kyaraImport.findFirst({ where: { status: "PENDING" }, orderBy: { requestedAt: "asc" }, select: { requestedAt: true } }),
  ]);
  const count = (status: string) => groups.find((g) => g.status === status)?._count._all ?? 0;
  return {
    pending: count("PENDING"),
    ready: count("READY"),
    done: count("DONE"),
    rejected: count("REJECTED"),
    cancelled: count("CANCELLED"),
    oldestPendingAt: oldest?.requestedAt ?? null,
  };
}
