import { getTranslations } from "next-intl/server";
import { GeneralSettingsForm } from "@/components/admin/GeneralSettingsForm";
import { SettingLogList } from "@/components/admin/SettingLogList";
import { UsageEstimate } from "@/components/admin/UsageEstimate";
import { GENERAL_SETTING_KEYS, type GeneralSettings } from "@/lib/settings/general-form";
import { recentSettingLogs, requireAdmin } from "@/server/admin";
import { averageDailyPlayers, currentPollSettings } from "@/server/admin/usage";
import { getSetting } from "@/server/settings";

/** Réglages généraux sans module propre. */
export default async function AdminGeneralPage() {
  await requireAdmin();
  const [t, values, logs, pollSettings, observedPlayers] = await Promise.all([
    getTranslations("admin.general"),
    Promise.all(GENERAL_SETTING_KEYS.map((k) => getSetting(k))),
    recentSettingLogs(GENERAL_SETTING_KEYS),
    currentPollSettings(),
    averageDailyPlayers(),
  ]);
  const settings = Object.fromEntries(GENERAL_SETTING_KEYS.map((k, i) => [k, values[i]])) as GeneralSettings;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
      </div>
      <GeneralSettingsForm initial={settings} />
      <UsageEstimate settings={pollSettings} observedPlayers={observedPlayers} />
      <SettingLogList logs={logs} />
    </div>
  );
}
