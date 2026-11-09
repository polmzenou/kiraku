import { getTranslations } from "next-intl/server";
import { SettingLogList } from "@/components/admin/SettingLogList";
import { ShowcaseThemesForm } from "@/components/admin/ShowcaseThemesForm";
import { referencedSeries } from "@/lib/profile/conditions";
import type { ShowcaseSettings } from "@/lib/settings/showcase-form";
import { themeConditions } from "@/lib/showcase/themes";
import { recentSettingLogs, requireAdmin } from "@/server/admin";
import { prisma } from "@/server/db";
import { getSetting } from "@/server/settings";

/** Vitrines des joueurs : nombre par joueur, statut et condition de déblocage de chaque thème. */
export default async function AdminShowcasesPage() {
  await requireAdmin();
  const [t, maxPerPlayer, themes, usage, logs] = await Promise.all([
    getTranslations("admin.showcases"),
    getSetting("showcase.maxPerPlayer"),
    getSetting("showcase.themes"),
    prisma.showcase.groupBy({ by: ["theme"], _count: { _all: true } }),
    recentSettingLogs(["showcase."]),
  ]);
  const settings: ShowcaseSettings = { "showcase.maxPerPlayer": maxPerPlayer, "showcase.themes": themes };
  const counts: Record<string, number> = Object.fromEntries(usage.map((u) => [u.theme, u._count._all]));

  // Titres des séries citées par une condition « série complétée »
  const seriesIds = referencedSeries(themeConditions(themes));
  const seriesTitles: Record<string, string> =
    seriesIds.length === 0
      ? {}
      : Object.fromEntries(
          (await prisma.series.findMany({ where: { id: { in: seriesIds } }, select: { id: true, titleRomaji: true } })).map((s) => [s.id, s.titleRomaji]),
        );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
      </div>

      <ShowcaseThemesForm initial={settings} usage={counts} seriesTitles={seriesTitles} />

      <SettingLogList logs={logs} />
    </div>
  );
}
