import { getTranslations } from "next-intl/server";
import { FeatureSettingsForm } from "@/components/admin/FeatureSettingsForm";
import { SettingLogList } from "@/components/admin/SettingLogList";
import { FEATURE_SETTING_KEYS, type FeatureSettings } from "@/lib/settings/features-form";
import { recentSettingLogs, requireAdmin } from "@/server/admin";
import { getPaymentProvider } from "@/server/payments/provider";
import { getSetting } from "@/server/settings";

/** Fonctionnalités : tous les interrupteurs de modules réunis (casino, boutique, marché, combat…). */
export default async function AdminFeaturesPage() {
  await requireAdmin();
  const [t, values, logs] = await Promise.all([
    getTranslations("admin.features"),
    Promise.all(FEATURE_SETTING_KEYS.map((k) => getSetting(k))),
    recentSettingLogs(FEATURE_SETTING_KEYS),
  ]);
  const settings = Object.fromEntries(FEATURE_SETTING_KEYS.map((k, i) => [k, values[i]])) as FeatureSettings;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="font-title text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
      </div>
      <FeatureSettingsForm initial={settings} premiumReady={getPaymentProvider() !== null} />
      <SettingLogList logs={logs} />
    </div>
  );
}
