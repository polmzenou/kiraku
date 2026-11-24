import { getLocale, getTranslations } from "next-intl/server";
import { ReferralAdminTabs } from "@/components/admin/referral/ReferralAdminTabs";
import { ReferralV2SettingsForm } from "@/components/admin/referral/ReferralV2SettingsForm";
import { SettingLogList } from "@/components/admin/SettingLogList";
import { canManageReferrals } from "@/lib/admin/roles";
import { REFERRAL_V2_FORM_KEYS, type ReferralV2Settings } from "@/lib/settings/referral-v2-form";
import { recentSettingLogs, requireAdminView } from "@/server/admin";
import { lotOptions } from "@/server/economy/admin-queries";
import { heldReferralCount } from "@/server/referral/admin-queries";
import { getSetting } from "@/server/settings";

/**
 * Réglages du parrainage v2 : interrupteur, conditions des étapes, lots des deux côtés, paliers et contrôles. Toute
 * l'équipe (ADMIN et DEV) les modifie (canManageReferrals) ; chaque clé changée est écrite dans le journal admin.
 */
export default async function AdminReferralSettingsPage() {
  const { user } = await requireAdminView();
  const locale = await getLocale();
  const [t, values, lots, logs, held] = await Promise.all([
    getTranslations("admin.referralV2.settings"),
    Promise.all(REFERRAL_V2_FORM_KEYS.map((k) => getSetting(k))),
    lotOptions(locale),
    recentSettingLogs(["referral.v2."]),
    heldReferralCount(),
  ]);
  const settings = Object.fromEntries(REFERRAL_V2_FORM_KEYS.map((k, i) => [k, values[i]])) as ReferralV2Settings;

  return (
    <div className="flex flex-col gap-6">
      <ReferralAdminTabs active="settings" held={held} />
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
      </div>
      {canManageReferrals(user.role) ? (
        <ReferralV2SettingsForm initial={settings} lots={lots} />
      ) : (
        <p className="text-sm text-text-muted">{t("readOnly")}</p>
      )}
      <SettingLogList logs={logs} />
    </div>
  );
}
