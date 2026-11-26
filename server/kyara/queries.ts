import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { isFrozen } from "@/lib/account/deletion";
import { isStaff } from "@/lib/admin/roles";
import { isKyaraRejectCode, type KyaraImportStatus } from "@/lib/kyara/codes";
import { KYARA_BANNER_COOKIE, kyaraBannerOf, playerKyaraPhase, showKyaraTile, type KyaraBannerView, type PlayerKyaraPhase } from "@/lib/kyara/phase";
import type { KyaraAutoCaps } from "@/lib/kyara/plan";
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

export type KyaraGuards = { autoCaps: KyaraAutoCaps; staffKeyDays: number; reminderCooldownHours: number };

/** Garde-fous de l'équipe : plafonds du versement automatique, durée de la clé du favori, délai entre deux relances. */
export const getKyaraGuards = cache(async (): Promise<KyaraGuards> => {
  const [maxCards, maxZeni, staffKeyDays, reminderCooldownHours] = await Promise.all([
    getSetting("kyaraImport.autoMaxCards"),
    getSetting("kyaraImport.autoMaxZeni"),
    getSetting("kyaraImport.staffKeyDays"),
    getSetting("kyaraImport.reminderCooldownHours"),
  ]);
  return { autoCaps: { maxCards, maxZeni }, staffKeyDays, reminderCooldownHours };
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
  /** Connu une fois la collection lue par l'équipe. */
  kyaraUserId: string | null;
  status: KyaraImportStatus;
  requestedAt: Date;
  /** Fin de la fenêtre du joueur à la demande ; null pour une demande de test de l'équipe. */
  deadlineAt: Date | null;
  rejectNote: string | null;
  grantedCards: number | null;
  grantedZeni: number | null;
  zeniRaw: number | null;
  appliedAt: Date | null;
  summary: KyaraImportSummary | null;
};

export type KyaraPlayerView = { phase: PlayerKyaraPhase; rules: KyaraRules; request: KyaraRequestView | null };

/** Dernière demande du joueur, ce qu'en lit sa phase. */
type LatestRow = { status: KyaraImportStatus; rejectCode: string | null } | null;

const latestOf = (userId: string) =>
  prisma.kyaraImport.findFirst({ where: { userId }, orderBy: { requestedAt: "desc" }, select: { status: true, rejectCode: true } });

/**
 * Phase du joueur (lib/kyara/phase.ts), la même pour sa page, la bannière de l'accueil et la tuile du Compte : sa
 * dernière demande (lue en même temps que son Discord), puis, s'il n'a rien en cours, si ce Discord a déjà servi.
 */
async function phaseFor(user: KyaraUser, rules: KyaraRules, latest: LatestRow | Promise<LatestRow>, now: number, staff: boolean): Promise<PlayerKyaraPhase> {
  const [last, discord] = await Promise.all([
    latest,
    prisma.account.findFirst({ where: { userId: user.id, provider: "discord" }, select: { providerAccountId: true } }),
  ]);
  // Une demande en cours ou versée décide seule de la phase : inutile de chercher le Discord ailleurs
  const settled = last !== null && (ACTIVE as readonly string[]).includes(last.status);
  // Ce Discord a-t-il déjà servi ailleurs (compte supprimé compris, dont la ligne n'a plus de joueur) ?
  const usedElsewhere =
    discord !== null &&
    !settled &&
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
      staff,
    },
    rules,
    now,
  );
  const row = last ? { status: last.status, rejectCode: isKyaraRejectCode(last.rejectCode) ? last.rejectCode : null } : null;
  return playerKyaraPhase(eligibility, row, usedElsewhere);
}

/** Page /compte/import-kyara : phase du joueur, réglages utiles à l'affichage et sa dernière demande. */
export async function playerKyaraView(user: KyaraUser, now: Date): Promise<KyaraPlayerView> {
  const rules = await getKyaraRules();
  // Une seule requête, attendue par la phase et par la page
  const latestRequest = Promise.resolve(
    prisma.kyaraImport.findFirst({
      where: { userId: user.id },
      orderBy: { requestedAt: "desc" },
      select: {
        id: true,
        kyaraUserId: true,
        status: true,
        requestedAt: true,
        deadlineAt: true,
        rejectCode: true,
        rejectNote: true,
        grantedCards: true,
        grantedZeni: true,
        zeniRaw: true,
        appliedAt: true,
        summary: true,
      },
    }),
  );
  const [phase, latest] = await Promise.all([phaseFor(user, rules, latestRequest, now.getTime(), isStaff(user.role)), latestRequest]);
  return {
    phase,
    rules,
    request: latest
      ? {
          id: latest.id,
          kyaraUserId: latest.kyaraUserId,
          status: latest.status,
          requestedAt: latest.requestedAt,
          deadlineAt: latest.deadlineAt,
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

/**
 * Bannière de l'accueil : seulement quand le joueur peut agir (kyaraBannerOf). Masquée par « Plus tard » (cookie) ou
 * hors fenêtre : aucune requête (réglages en cache et compte déjà lu) ; sinon la phase du joueur, comme sa page.
 */
export async function kyaraBannerFor(user: KyaraUser | null, now: number): Promise<KyaraBannerView | null> {
  if (!user || user.bannedAt !== null || isFrozen(user)) return null;
  if ((await cookies()).get(KYARA_BANNER_COOKIE)?.value === "1") return null;
  const rules = await getKyaraRules();
  // Discord supposé lié : seule la fenêtre compte ici, la phase tranche ensuite
  const e = kyaraEligibility(
    { isGuest: user.isGuest, registeredAt: user.registeredAt, createdAt: user.createdAt, discordLinked: true, unavailable: false, staff: false },
    rules,
    now,
  );
  if (!e.ok) return e.reason === "GUEST" ? { kind: "GUEST", deadline: null } : null;
  // L'équipe voit la bannière comme un joueur
  return kyaraBannerOf(await phaseFor(user, rules, latestOf(user.id), now, false));
}

/**
 * Tuile du Compte : tant qu'il y a quelque chose à faire ou à relire (showKyaraTile) ; l'équipe la voit aussi hors
 * lancement (demande de test). Import coupé et aucune demande : une seule lecture.
 */
export async function kyaraTileVisible(user: KyaraUser, now: number): Promise<boolean> {
  const rules = await getKyaraRules();
  const staff = isStaff(user.role);
  const latest = await latestOf(user.id);
  if (latest === null && !rules.enabled && !staff) return false;
  return showKyaraTile(await phaseFor(user, rules, latest, now, staff));
}

export const QUEUE_TABS = ["PENDING", "READY", "DONE", "REJECTED"] as const;
export type QueueTab = (typeof QUEUE_TABS)[number];

/**
 * File de /admin/kyara : demandes d'un statut, les plus anciennes d'abord (les traitées, les plus récentes). En attente :
 * relances déjà envoyées (nombre et dernière), lues dans le journal admin (le joueur peut effacer ses notifications).
 */
export async function kyaraQueue(tab: QueueTab, take = 50) {
  const rows = await prisma.kyaraImport.findMany({
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
      reviewReason: true,
      snapshotCards: true,
      grantedCards: true,
      grantedZeni: true,
      reopenCount: true,
      user: { select: { id: true, username: true, createdAt: true } },
    },
  });
  const ids = tab === "PENDING" ? rows.map((r) => r.id) : [];
  const sent =
    ids.length > 0
      ? await prisma.adminLog.groupBy({
          by: ["targetId"],
          where: { action: "KYARA_IMPORT_REMIND", targetType: "KyaraImport", targetId: { in: ids } },
          _count: { _all: true },
          _max: { createdAt: true },
        })
      : [];
  const byImport = new Map(sent.flatMap((s) => (s.targetId && s._max.createdAt ? [[s.targetId, { count: s._count._all, lastAt: s._max.createdAt }] as const] : [])));
  return rows.map((r) => ({ ...r, reminders: byImport.get(r.id) ?? null }));
}

/**
 * Fiche d'une demande pour l'équipe, avec l'aperçu recalculé si elle est lue. Sans la photo de la collection (lourde) :
 * seul l'aperçu d'une demande lue la relit.
 */
export async function kyaraImportDetail(importId: string) {
  const row = await prisma.kyaraImport.findUnique({
    where: { id: importId },
    select: {
      id: true,
      userId: true,
      status: true,
      discordId: true,
      requestedAt: true,
      deadlineAt: true,
      reviewReason: true,
      kyaraUserId: true,
      kyaraUsername: true,
      kyaraDiscordId: true,
      discordVerified: true,
      snapshotCards: true,
      snapshotCopies: true,
      snapshotTotal: true,
      readAt: true,
      receivedById: true,
      grantedCards: true,
      grantedZeni: true,
      appliedAt: true,
      rejectCode: true,
      rejectNote: true,
      rejectedAt: true,
      user: { select: { id: true, username: true, createdAt: true, bannedAt: true } },
    },
  });
  if (!row) return null;
  const [preview, others] = await Promise.all([
    row.status === "READY" ? previewImportWith(prisma, row.id) : null,
    // Autres demandes où ce profil Kyara a été lu (refusées comprises)
    row.kyaraUserId === null ? 0 : prisma.kyaraImport.count({ where: { kyaraUserId: row.kyaraUserId, id: { not: row.id } } }),
  ]);
  return { row, preview: preview?.plan ?? null, sameProfile: others };
}

/** Date de la clé du favori de ce membre de l'équipe, ou null s'il n'en a pas encore. */
export async function staffKeyIssuedAt(userId: string): Promise<Date | null> {
  return (await prisma.kyaraStaffKey.findUnique({ where: { userId }, select: { createdAt: true } }))?.createdAt ?? null;
}

/** Demandes en attente, à choisir à la main quand l'avatar Kyara ne montre pas d'ID Discord (jamais la sienne). */
export async function pendingKyaraRequests(staffId: string, take = 200) {
  const rows = await prisma.kyaraImport.findMany({
    where: { status: "PENDING", userId: { not: staffId } },
    orderBy: { requestedAt: "asc" },
    take,
    select: { id: true, requestedAt: true, user: { select: { username: true } } },
  });
  return rows.flatMap((r) => (r.user ? [{ id: r.id, requestedAt: r.requestedAt, username: r.user.username }] : []));
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
