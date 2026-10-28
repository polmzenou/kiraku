import { getTranslations } from "next-intl/server";
import type { HostKey } from "@/lib/usage/host";
import { quotaLevel, type AlertThresholds } from "@/lib/usage/quota";
import type { HostSnapshot } from "@/server/admin/host-usage";

const BAR = { critical: "bg-shu", warn: "bg-kin", ok: "bg-ai", unknown: "bg-border" } as const;
const BORDER = { critical: "border-shu", warn: "border-kin", ok: "border-border", unknown: "border-border" } as const;

type Row = { key: HostKey; value: string | null; detail: string | null };

/**
 * Consommation du serveur (charge, RAM, disque, connexions Postgres) face à sa capacité, avec les
 * seuils réglés dans /admin. Une mesure qui a échoué s'affiche « indisponible ».
 */
export async function HostUsage({ snapshot, thresholds }: { snapshot: HostSnapshot; thresholds: AlertThresholds }) {
  const t = await getTranslations("admin.usage.host");
  const { measures, database } = snapshot;
  const gb = (bytes: number) => t("gb", { value: (bytes / 1_073_741_824).toFixed(1) });
  const mb = (bytes: number) => t("mb", { value: (bytes / 1_048_576).toFixed(0) });
  const duration = (seconds: number) => t("duration", { days: Math.floor(seconds / 86_400), hours: Math.floor((seconds % 86_400) / 3_600) });
  const share = Object.fromEntries(snapshot.shares.map((s) => [s.key, s.share])) as Record<HostKey, number | null>;
  const { load, memory, disk, connections } = measures;

  const rows: Row[] = [
    {
      key: "cpu",
      value: load && t("load", { one: load.one.toFixed(2), five: load.five.toFixed(2), fifteen: load.fifteen.toFixed(2) }),
      detail: load && t("cores", { count: load.cores }),
    },
    {
      key: "memory",
      value: memory && t("used", { used: gb(memory.totalBytes - memory.availableBytes), total: gb(memory.totalBytes) }),
      detail: memory && t("available", { value: gb(memory.availableBytes) }),
    },
    {
      key: "disk",
      value: disk && t("used", { used: gb(disk.totalBytes - disk.freeBytes), total: gb(disk.totalBytes) }),
      detail: disk && t("free", { value: gb(disk.freeBytes) }),
    },
    {
      key: "connections",
      value: connections && t("used", { used: String(connections.open), total: String(connections.max) }),
      detail: connections && t("connectionsNote"),
    },
  ];
  const facts = [
    { label: t("facts.database"), value: database.bytes === null ? t("unavailable") : mb(database.bytes) },
    { label: t("facts.app"), value: mb(snapshot.appBytes) },
    { label: t("facts.hostUptime"), value: duration(snapshot.uptime.host) },
    { label: t("facts.appUptime"), value: duration(snapshot.uptime.app) },
  ];

  return (
    <section id="usage" aria-labelledby="host-usage" className="flex scroll-mt-4 flex-col gap-4 lacquer rounded-card p-4">
      <div className="flex flex-col gap-1">
        <h3 id="host-usage" className="font-title text-lg font-bold">
          {t("title")}
        </h3>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {rows.map((r) => {
          const level = quotaLevel(share[r.key], thresholds);
          const percent = Math.round((share[r.key] ?? 0) * 100);
          return (
            <li key={r.key} className={`flex flex-col gap-1.5 rounded-control border p-3 ${BORDER[level]}`}>
              <span className="text-xs text-text-muted">{t(`metrics.${r.key}`)}</span>
              {r.value === null ? (
                <span className="text-lg font-bold text-text-muted">{t("unavailable")}</span>
              ) : (
                <>
                  <span className="text-lg font-bold tabular-nums">{r.value}</span>
                  <div
                    role="meter"
                    aria-label={t(`metrics.${r.key}`)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                    className="h-2 overflow-hidden rounded-pill bg-surface-2"
                  >
                    <div className={`h-full origin-left rounded-pill ${BAR[level]}`} style={{ transform: `scaleX(${Math.min(1, share[r.key] ?? 0)})` }} />
                  </div>
                  <span className="text-xs text-text-muted tabular-nums">
                    {share[r.key] === null ? t("noLimit") : t("percent", { value: percent })}
                    {r.detail && ` · ${r.detail}`}
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ul>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        {facts.map((f) => (
          <div key={f.label} className="flex flex-col">
            <dt className="text-xs text-text-muted">{f.label}</dt>
            <dd className="font-bold tabular-nums">{f.value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-2">
        <h4 className="font-title font-bold">{t("tables")}</h4>
        {database.tables === null ? (
          <p className="text-sm text-text-muted">{t("unavailable")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[16rem] text-sm tabular-nums">
              <caption className="sr-only">{t("tables")}</caption>
              <thead>
                <tr className="text-left text-text-muted">
                  <th scope="col" className="py-1 pr-3 font-normal">{t("table")}</th>
                  <th scope="col" className="py-1 text-right font-normal">{t("size")}</th>
                </tr>
              </thead>
              <tbody>
                {database.tables.map((row) => (
                  <tr key={row.name} className="border-t border-border">
                    <th scope="row" className="break-all py-1.5 pr-3 text-left font-normal">{row.name}</th>
                    <td className="py-1.5 text-right">{mb(row.bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-text-muted">{t("caveat")}</p>
      <p className="text-xs text-text-muted">{t("measuredAt", { at: new Date(snapshot.measuredAt) })}</p>
    </section>
  );
}
