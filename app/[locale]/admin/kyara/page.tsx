import { getFormatter, getTranslations } from "next-intl/server";
import { KyaraImportSettingsForm } from "@/components/admin/KyaraImportSettingsForm";
import { ReadOnly } from "@/components/admin/ReadOnly";
import { SettingLogList } from "@/components/admin/SettingLogList";
import { Link } from "@/i18n/navigation";
import { KYARA_FORM_KEYS, type KyaraSettings } from "@/lib/settings/kyara-form";
import { recentSettingLogs, requireAdminView } from "@/server/admin";
import { getKyaraRules, kyaraAdminOverview } from "@/server/kyara/queries";
import { getSetting } from "@/server/settings";

/**
 * Import Kyara (étape 17) : état de la sortie, file des demandes (toute l'équipe la traite) et réglages (admin
 * seul ; lecture seule pour le DEV).
 */
export default async function AdminKyaraPage() {
  const { readOnly } = await requireAdminView();
  const now = new Date().getTime();
  const [t, format, values, rules, overview, logs] = await Promise.all([
    getTranslations("admin.kyara"),
    getFormatter(),
    Promise.all(KYARA_FORM_KEYS.map((k) => getSetting(k))),
    getKyaraRules(),
    kyaraAdminOverview(),
    recentSettingLogs(["kyaraImport."]),
  ]);
  const settings = Object.fromEntries(KYARA_FORM_KEYS.map((k, i) => [k, values[i]])) as KyaraSettings;
  const configured = rules.launchAt !== null && rules.staffKyaraUserId !== null;
  const status = !rules.enabled ? "off" : !configured ? "unconfigured" : now < rules.launchAt! ? "scheduled" : "open";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
        <p className="text-sm font-bold" role="status">
          {t(`status.${status}`, { date: rules.launchAt !== null ? format.dateTime(new Date(rules.launchAt), { dateStyle: "full", timeStyle: "short" }) : "" })}
        </p>
        {rules.enabled && !configured && (
          <p role="alert" className="text-sm font-bold text-shu">
            {t("unconfiguredHelp")}
          </p>
        )}
        <Link href="/compte/import-kyara" className="w-fit text-sm text-link underline underline-offset-4">
          {t("preview")}
        </Link>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="kyara-queue-stats">
        <h3 id="kyara-queue-stats" className="font-title text-lg font-bold">
          {t("stats.title")}
        </h3>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {(
            [
              ["pending", overview.pending],
              ["ready", overview.ready],
              ["done", overview.done],
              ["rejected", overview.rejected],
              ["cancelled", overview.cancelled],
            ] as const
          ).map(([key, value]) => (
            <div key={key} className="lacquer rounded-card p-4">
              <dt className="text-sm text-text-muted">{t(`stats.${key}`)}</dt>
              <dd className="font-heading text-2xl tabular-nums">{format.number(value)}</dd>
            </div>
          ))}
        </dl>
        {overview.oldestPendingAt && (
          <p className="text-sm text-text-muted">{t("stats.oldest", { date: format.relativeTime(overview.oldestPendingAt, now) })}</p>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="kyara-settings">
        <h3 id="kyara-settings" className="font-title text-lg font-bold">
          {t("settings.title")}
        </h3>
        {readOnly && <p className="text-sm text-text-muted">{t("settings.readOnly")}</p>}
        <ReadOnly when={readOnly}>
          <KyaraImportSettingsForm initial={settings} />
        </ReadOnly>
      </section>
      <SettingLogList logs={logs} />
    </div>
  );
}
