import { getFormatter, getTranslations } from "next-intl/server";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Link } from "@/i18n/navigation";
import { logQuery, parseAdminLogParams } from "@/lib/admin/logs";
import { requireAdmin } from "@/server/admin";
import { adminTargetHref, listAdminLogs } from "@/server/admin/logs";

const inputClass = "min-h-11 w-full min-w-0 rounded-control border border-border bg-surface-2 px-3 text-base";

/** Lisible et échappé par React : jamais de HTML injecté depuis le journal. */
function json(value: unknown): string {
  if (value === null || value === undefined) return "—";
  return JSON.stringify(value, null, 2);
}

/** Journal de toutes les écritures faites depuis /admin : qui, quoi, sur quoi, avant, après. */
export default async function AdminLogPage({ searchParams }: PageProps<"/[locale]/admin/journal">) {
  await requireAdmin();
  const params = parseAdminLogParams(await searchParams);
  const [t, format, { items, nextCursor }] = await Promise.all([
    getTranslations("admin.journal"),
    getFormatter(),
    listAdminLogs(params),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-title text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
      </div>

      <form className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3">
        {(
          [
            ["action", "text", t("action"), "SETTING_UPDATE"],
            ["type", "text", t("type"), "User"],
            ["target", "text", t("target"), ""],
            ["admin", "text", t("admin"), ""],
            ["from", "date", t("from"), ""],
            ["to", "date", t("to"), ""],
          ] as const
        ).map(([name, type, label, placeholder]) => (
          <label key={name} className="flex flex-col gap-1 text-sm">
            {label}
            <input
              name={name}
              type={type}
              defaultValue={params[name] ?? ""}
              placeholder={placeholder}
              maxLength={80}
              autoCapitalize="none"
              spellCheck={false}
              className={inputClass}
            />
          </label>
        ))}
        <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
          <Button type="submit" variant="primary">
            {t("filter")}
          </Button>
          <Link href="/admin/journal" className={buttonClasses()}>
            {t("reset")}
          </Link>
        </div>
      </form>

      {items.length === 0 ? (
        <p className="text-sm text-text-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((log) => {
            const href = adminTargetHref(log.targetType, log.targetId);
            return (
              <li key={log.id} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-bold">{log.action}</span>
                  <time dateTime={log.createdAt.toISOString()} className="text-xs text-text-muted tabular-nums">
                    {format.dateTime(log.createdAt, { dateStyle: "short", timeStyle: "medium" })}
                  </time>
                </div>
                <p className="text-text-muted">
                  {t("by", { admin: log.admin.username })} · {log.targetType}
                  {log.targetId && (
                    <>
                      {" · "}
                      {href ? (
                        <Link href={href} className="break-all text-link underline underline-offset-4">
                          {log.targetId}
                        </Link>
                      ) : (
                        <span className="break-all">{log.targetId}</span>
                      )}
                    </>
                  )}
                </p>
                {(log.before !== null || log.after !== null) && (
                  <details>
                    <summary className="min-h-11 cursor-pointer py-2 text-xs font-bold text-text-muted">{t("changes")}</summary>
                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-text-muted">{t("before")}</span>
                        <pre className="max-h-64 overflow-auto rounded-control bg-surface-2 p-2 font-body text-xs whitespace-pre-wrap break-all">{json(log.before)}</pre>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-text-muted">{t("after")}</span>
                        <pre className="max-h-64 overflow-auto rounded-control bg-surface-2 p-2 font-body text-xs whitespace-pre-wrap break-all">{json(log.after)}</pre>
                      </div>
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <nav aria-label={t("pagination")} className="flex flex-wrap items-center justify-between gap-3">
        {params.cursor ? (
          <Link href={{ pathname: "/admin/journal", query: logQuery(params) }} className={buttonClasses()}>
            {t("first")}
          </Link>
        ) : (
          <span />
        )}
        {nextCursor && (
          <Link href={{ pathname: "/admin/journal", query: logQuery(params, nextCursor) }} className={buttonClasses()}>
            {t("older")}
          </Link>
        )}
      </nav>
    </div>
  );
}
