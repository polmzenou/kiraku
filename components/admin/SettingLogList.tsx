import { getFormatter, getTranslations } from "next-intl/server";
import type { recentSettingLogs } from "@/server/admin";

type Log = Awaited<ReturnType<typeof recentSettingLogs>>[number];

/** Derniers changements de réglages d'un module (qui, quand, avant → après). */
export async function SettingLogList({ logs }: { logs: Log[] }) {
  const [t, format] = await Promise.all([getTranslations("admin.settingsForm"), getFormatter()]);
  return (
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
  );
}
