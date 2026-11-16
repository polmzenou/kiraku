import "server-only";
import { localize, parseLocalized } from "@/lib/boosters/types";
import type { ExpeditionTypeInput } from "@/lib/expedition/admin-form";
import { loreOf } from "@/lib/expedition/snapshot";
import type { ExpeditionRisk } from "@/lib/expedition/types";
import { prisma } from "../db";

// Lectures de /admin/expeditions : modèles, expéditions en route, chiffres des 7 derniers jours.

const WEEK_MS = 7 * 86_400_000;

export async function adminExpeditionTypes() {
  const rows = await prisma.expeditionType.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { expeditions: true } } },
  });
  return rows.map((t) => ({
    input: {
      id: t.id,
      slug: t.slug,
      name: parseLocalized(t.name, t.slug),
      lore: loreOf(t.lore),
      minRarity: t.minRarity,
      risk: t.risk as ExpeditionRisk,
      durationMinutes: t.durationMinutes,
      baseSuccessPct: t.baseSuccessPct,
      maxSuccessPct: t.maxSuccessPct,
      maxTriumphPct: t.maxTriumphPct,
      minDiscoveryPct: t.minDiscoveryPct,
      zeni: t.zeni,
      boosterTypeId: t.boosterTypeId,
      boosters: t.boosters,
      extraLotId: t.extraLotId,
      weight: t.weight,
      active: t.active,
      sortOrder: t.sortOrder,
    } satisfies ExpeditionTypeInput,
    played: t._count.expeditions,
  }));
}

/** Types de booster qu'une expédition peut verser en crédits (pas les sachets scellés). */
export async function boosterTypeOptions(locale: string) {
  const rows = await prisma.boosterType.findMany({
    where: { kind: { not: "DROP" } },
    orderBy: [{ family: "asc" }, { sortOrder: "asc" }],
    select: { id: true, slug: true, name: true },
  });
  return rows.map((b) => ({ id: b.id, name: localize(parseLocalized(b.name, b.slug), locale) }));
}

export async function activeExpeditions(locale: string) {
  const rows = await prisma.expedition.findMany({
    where: { status: "ACTIVE" },
    orderBy: { endsAt: "asc" },
    take: 100,
    select: { id: true, startedAt: true, endsAt: true, successPct: true, user: { select: { username: true } }, type: { select: { slug: true, name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    username: r.user.username,
    name: localize(parseLocalized(r.type.name, r.type.slug), locale),
    startedAt: r.startedAt,
    endsAt: r.endsAt,
    successPct: r.successPct / 100,
  }));
}

/** Lancements, issues et Zeni versés sur 7 jours. */
export async function expeditionStats(now = new Date()) {
  const since = new Date(now.getTime() - WEEK_MS);
  const [byOutcome, abandoned, active, zeni] = await Promise.all([
    prisma.expedition.groupBy({ by: ["outcome"], where: { status: "COMPLETED", settledAt: { gte: since } }, _count: true }),
    prisma.expedition.count({ where: { status: "ABANDONED", abandonedAt: { gte: since } } }),
    prisma.expedition.count({ where: { status: "ACTIVE" } }),
    prisma.coinTransaction.aggregate({ where: { reason: "EXPEDITION", createdAt: { gte: since } }, _sum: { amount: true } }),
  ]);
  const count = (o: string) => byOutcome.find((r) => r.outcome === o)?._count ?? 0;
  const completed = count("FAILURE") + count("SUCCESS") + count("TRIUMPH");
  return {
    active,
    completed,
    abandoned,
    triumph: count("TRIUMPH"),
    success: count("SUCCESS"),
    failure: count("FAILURE"),
    successRate: completed > 0 ? Math.round((100 * (count("SUCCESS") + count("TRIUMPH"))) / completed) : null,
    zeni: zeni._sum.amount ?? 0,
  };
}
