import { getTranslations } from "next-intl/server";
import { AchievementSettingsForm, type AdminAchievementGroup } from "@/components/admin/AchievementSettingsForm";
import { SettingLogList } from "@/components/admin/SettingLogList";
import { ACHIEVEMENT_CATEGORIES, ACHIEVEMENTS, CATEGORY_KANJI, isAdjustable } from "@/lib/achievements/catalog";
import { ACHIEVEMENT_SETTING_KEYS, type AchievementSettingsForm as AchievementSettingsValues } from "@/lib/settings/achievements-form";
import { recentSettingLogs, requireAdmin } from "@/server/admin";
import { prisma } from "@/server/db";
import { getSetting } from "@/server/settings";

/** Succès : interrupteur, seuils réglables, succès actifs, et combien de joueurs ont débloqué chacun. */
export default async function AdminAchievementsPage() {
  await requireAdmin();
  const [t, tItems, values, logs, counts] = await Promise.all([
    getTranslations("admin.achievements"),
    getTranslations("achievements"),
    Promise.all(ACHIEVEMENT_SETTING_KEYS.map((k) => getSetting(k))),
    recentSettingLogs(ACHIEVEMENT_SETTING_KEYS),
    prisma.userAchievement.groupBy({ by: ["key"], _count: { _all: true } }),
  ]);
  const settings = Object.fromEntries(ACHIEVEMENT_SETTING_KEYS.map((k, i) => [k, values[i]])) as AchievementSettingsValues;
  const unlocked = new Map(counts.map((c) => [c.key, c._count._all]));

  const groups: AdminAchievementGroup[] = ACHIEVEMENT_CATEGORIES.map((category) => ({
    category,
    kanji: CATEGORY_KANJI[category],
    title: tItems(`categories.${category}`),
    rows: ACHIEVEMENTS.filter((a) => a.category === category).map((a) => ({
      key: a.key,
      rank: a.rank,
      name: tItems(`items.${a.key}.name` as "items.booster-1.name"),
      desc: tItems(`items.${a.key}.desc` as "items.booster-1.desc", { count: a.goal }),
      defaultGoal: a.goal,
      adjustable: isAdjustable(a),
      unlocked: unlocked.get(a.key) ?? 0,
    })),
  }));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
      </div>
      <AchievementSettingsForm initial={settings} groups={groups} />
      <SettingLogList logs={logs} />
    </div>
  );
}
