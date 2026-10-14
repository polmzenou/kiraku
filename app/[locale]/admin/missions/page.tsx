import { getLocale, getTranslations } from "next-intl/server";
import { MissionForm } from "@/components/admin/MissionForm";
import { Link } from "@/i18n/navigation";
import { localizedSchema } from "@/lib/boosters/types";
import type { Rarity } from "@/lib/catalog/rarity";
import type { MissionInput } from "@/lib/economy/missions";
import { requireAdmin } from "@/server/admin";
import { prisma } from "@/server/db";
import { lotOptions } from "@/server/economy/admin-queries";

/** Missions quotidiennes et hebdomadaires : objectif, période, lot ; activer ou désactiver. */
export default async function AdminMissionsPage({ searchParams }: PageProps<"/[locale]/admin/missions">) {
  await requireAdmin();
  const [t, tMetric, tPeriod, tRarity, locale, sp] = await Promise.all([
    getTranslations("admin.economy"),
    getTranslations("economy.missions.metric"),
    getTranslations("economy.missions.period"),
    getTranslations("rarity"),
    getLocale(),
    searchParams,
  ]);
  const editId = typeof sp.id === "string" ? sp.id : null;

  const [missions, lots] = await Promise.all([
    prisma.mission.findMany({
      orderBy: [{ period: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        key: true,
        period: true,
        metric: true,
        goal: true,
        rarity: true,
        title: true,
        lotId: true,
        active: true,
        sortOrder: true,
        _count: { select: { claims: true } },
      },
    }),
    lotOptions(locale),
  ]);
  const lotName = new Map(lots.map((l) => [l.id, l.name]));

  const editing = editId ? missions.find((m) => m.id === editId) : undefined;
  const title = editing ? localizedSchema.safeParse(editing.title) : null;
  const initial: MissionInput | null = editing
    ? {
        id: editing.id,
        key: editing.key,
        period: editing.period,
        metric: editing.metric,
        goal: editing.goal,
        rarity: editing.rarity as Rarity | null,
        title: title?.success ? title.data : null,
        lotId: editing.lotId,
        active: editing.active,
        sortOrder: editing.sortOrder,
      }
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-title text-2xl font-bold">{t("missionsTitle")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("missionsIntro")}</p>
      </div>

      <MissionForm key={editId ?? "new"} initial={initial} lots={lots} />

      <ul className="flex flex-col gap-2">
        {missions.map((m) => (
          <li key={m.id} className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="font-bold">
                <span className="mr-2 text-xs text-text-muted">{tPeriod(m.period)}</span>
                {tMetric(m.metric, { count: m.goal, rarity: m.rarity ? tRarity(m.rarity as Rarity) : "" })}
                {!m.active && <span className="ml-2 text-xs text-text-muted">{t("inactive")}</span>}
              </p>
              <p className="text-xs text-text-muted">
                {t("missionMeta", { key: m.key, lot: lotName.get(m.lotId) ?? "?", claims: m._count.claims })}
              </p>
            </div>
            <Link href={{ pathname: "/admin/missions", query: { id: m.id } }} className="inline-flex min-h-11 items-center text-sm text-ai underline underline-offset-4">
              {t("edit")}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
