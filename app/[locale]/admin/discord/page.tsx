import { getTranslations } from "next-intl/server";
import { DiscordSettingsForm } from "@/components/admin/DiscordSettingsForm";
import { SettingLogList } from "@/components/admin/SettingLogList";
import { DISCORD_SETTING_KEYS, type DiscordSettings } from "@/lib/settings/discord-form";
import { recentSettingLogs, requireAdmin } from "@/server/admin";
import { prisma } from "@/server/db";
import { getSetting } from "@/server/settings";

/** Discord : modal « Rejoins notre Discord » (lien, textes, déclencheur, fréquence) et bonus de liaison. */
export default async function AdminDiscordPage() {
  await requireAdmin();
  const [t, values, logs, joined] = await Promise.all([
    getTranslations("admin.discord"),
    Promise.all(DISCORD_SETTING_KEYS.map((k) => getSetting(k))),
    recentSettingLogs(["discord."]),
    prisma.user.count({ where: { discordJoinedAt: { not: null } } }),
  ]);
  const settings = Object.fromEntries(DISCORD_SETTING_KEYS.map((k, i) => [k, values[i]])) as DiscordSettings;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
        <p className="text-sm font-bold tabular-nums">{t("joinedCount", { count: joined })}</p>
      </div>
      <DiscordSettingsForm initial={settings} />
      <SettingLogList logs={logs} />
    </div>
  );
}
