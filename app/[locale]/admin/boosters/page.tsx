import { getFormatter, getTranslations } from "next-intl/server";
import { BoosterSettingsForm } from "@/components/admin/BoosterSettingsForm";
import { BOOSTER_SETTING_KEYS, type BoosterSettings } from "@/lib/settings/booster-form";
import { recentBoosterSettingLogs, requireAdmin } from "@/server/admin";
import { getSetting } from "@/server/settings";

export default async function AdminBoostersPage() {
  await requireAdmin();
  const [t, format, values, logs] = await Promise.all([
    getTranslations("admin.boosters"),
    getFormatter(),
    Promise.all(BOOSTER_SETTING_KEYS.map((k) => getSetting(k))),
    recentBoosterSettingLogs(),
  ]);
  const settings = Object.fromEntries(BOOSTER_SETTING_KEYS.map((k, i) => [k, values[i]])) as BoosterSettings;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
      </div>

      <BoosterSettingsForm initial={settings} />

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-bold">{t("log")}</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-text-muted">{t("logEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {logs.map((log) => (
              <li key={log.id} className="flex flex-col gap-1 rounded-control border border-border bg-surface p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-bold">{t("logEntry", { key: log.targetId ?? "", admin: log.admin.username })}</span>
                  <time dateTime={log.createdAt.toISOString()} className="text-xs text-text-muted">
                    {format.dateTime(log.createdAt, { dateStyle: "short", timeStyle: "short" })}
                  </time>
                </div>
                <p className="break-all text-xs text-text-muted">
                  {JSON.stringify(log.before)} → {JSON.stringify(log.after)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
