import { getFormatter, getTranslations } from "next-intl/server";
import { CollectionSettingsForm } from "@/components/admin/CollectionSettingsForm";
import { COLLECTION_SETTING_KEYS, type CollectionSettings } from "@/lib/settings/collection-form";
import { recentSettingLogs, requireAdmin } from "@/server/admin";
import { getSetting } from "@/server/settings";

export default async function AdminCollectionPage() {
  await requireAdmin();
  const [t, format, values, logs] = await Promise.all([
    getTranslations("admin.collection"),
    getFormatter(),
    Promise.all(COLLECTION_SETTING_KEYS.map((k) => getSetting(k))),
    recentSettingLogs(["collection.", "showcase."]),
  ]);
  const settings = Object.fromEntries(COLLECTION_SETTING_KEYS.map((k, i) => [k, values[i]])) as CollectionSettings;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="font-title text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
      </div>

      <CollectionSettingsForm initial={settings} />

      <section className="flex flex-col gap-3">
        <h2 className="font-title text-lg font-bold">{t("log")}</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-text-muted">{t("logEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {logs.map((log) => (
              <li key={log.id} className="flex flex-col gap-1 rounded-button border border-border bg-surface p-3 text-sm">
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
