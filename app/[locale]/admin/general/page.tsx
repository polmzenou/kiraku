import { getTranslations } from "next-intl/server";
import { GeneralSettingsForm } from "@/components/admin/GeneralSettingsForm";
import { SettingLogList } from "@/components/admin/SettingLogList";
import { SupabaseUsage } from "@/components/admin/SupabaseUsage";
import { UsageEstimate } from "@/components/admin/UsageEstimate";
import { UsageSettingsForm } from "@/components/admin/UsageSettingsForm";
import { GENERAL_SETTING_KEYS, type GeneralSettings } from "@/lib/settings/general-form";
import { USAGE_SETTING_KEYS, type UsageSettings } from "@/lib/settings/usage-form";
import { recentSettingLogs, requireAdmin } from "@/server/admin";
import { heaviestTables, usageSnapshot } from "@/server/admin/supabase-usage";
import { currentPollSettings } from "@/server/admin/usage";
import { getSetting } from "@/server/settings";

/** Réglages généraux sans module propre, et suivi des quotas (Vercel, Supabase). */
export default async function AdminGeneralPage() {
  await requireAdmin();
  const [t, values, usageValues, logs, pollSettings, snapshot, tables] = await Promise.all([
    getTranslations("admin.general"),
    Promise.all(GENERAL_SETTING_KEYS.map((k) => getSetting(k))),
    Promise.all(USAGE_SETTING_KEYS.map((k) => getSetting(k))),
    recentSettingLogs([...GENERAL_SETTING_KEYS, ...USAGE_SETTING_KEYS]),
    currentPollSettings(),
    usageSnapshot(),
    heaviestTables(),
  ]);
  const settings = Object.fromEntries(GENERAL_SETTING_KEYS.map((k, i) => [k, values[i]])) as GeneralSettings;
  const usage = Object.fromEntries(USAGE_SETTING_KEYS.map((k, i) => [k, usageValues[i]])) as UsageSettings;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
      </div>
      <GeneralSettingsForm initial={settings} />
      <SupabaseUsage snapshot={snapshot} tables={tables} limits={usage["usage.supabaseLimits"]} thresholds={usage["usage.alertThresholds"]} />
      <UsageEstimate
        settings={pollSettings}
        observedPlayers={snapshot.measures.dailyPlayers ?? 0}
        budget={usage["usage.vercelBudget"]}
        thresholds={usage["usage.alertThresholds"]}
      />
      <UsageSettingsForm initial={usage} />
      <SettingLogList logs={logs} />
    </div>
  );
}
