import { getTranslations } from "next-intl/server";
import { quotaLevel, usageShare, type AlertThresholds, type SupabaseLimits } from "@/lib/usage/quota";
import type { UsageSnapshot } from "@/server/admin/supabase-usage";

// Tableau d'usage Supabase de l'organisation (egress, stockage) : non lisible en SQL
const SUPABASE_USAGE_URL = "https://supabase.com/dashboard/org/_/usage";

const BAR = { critical: "bg-shu", warn: "bg-kin", ok: "bg-ai", unknown: "bg-border" } as const;
const BORDER = { critical: "border-shu", warn: "border-kin", ok: "border-border", unknown: "border-border" } as const;

type Row = { key: "database" | "connections" | "storage" | "egress"; value: string | null; limit: string | null; share: number | null; note?: string; estimate?: boolean };

/**
 * Consommation Supabase mesurée en SQL (taille, connexions, stockage) et egress estimé, face aux
 * limites du plan réglées dans /admin. Une mesure qui a échoué s'affiche « indisponible ».
 */
export async function SupabaseUsage({
  snapshot,
  tables,
  limits,
  thresholds,
}: {
  snapshot: UsageSnapshot;
  tables: { name: string; bytes: number }[] | null;
  limits: SupabaseLimits;
  thresholds: AlertThresholds;
}) {
  const t = await getTranslations("admin.usage.supabase");
  const { measures, egressGb } = snapshot;
  const mb = (bytes: number) => t("mb", { value: (bytes / 1_000_000).toFixed(1) });

  const rows: Row[] = [
    {
      key: "database",
      value: measures.dbBytes === null ? null : mb(measures.dbBytes),
      limit: t("mb", { value: String(limits.dbSizeMb) }),
      share: usageShare(measures.dbBytes, limits.dbSizeMb * 1_000_000),
    },
    {
      key: "connections",
      value: measures.connections ? t("count", { value: measures.connections.open }) : null,
      limit: measures.connections ? t("count", { value: measures.connections.max }) : null,
      share: measures.connections ? usageShare(measures.connections.open, measures.connections.max) : null,
      note: t("connectionsNote", { pooler: limits.poolerClients }),
    },
    {
      key: "storage",
      value: measures.storageBytes === null ? null : mb(measures.storageBytes),
      limit: t("gb", { value: String(limits.storageGb) }),
      share: usageShare(measures.storageBytes, limits.storageGb * 1_000_000_000),
    },
    {
      key: "egress",
      value: egressGb === null ? null : t("gb", { value: egressGb.toFixed(2) }),
      limit: t("gb", { value: String(limits.egressGb) }),
      share: usageShare(egressGb, limits.egressGb),
      estimate: true,
    },
  ];

  return (
    <section id="usage" aria-labelledby="supabase-usage" className="flex scroll-mt-4 flex-col gap-4 lacquer rounded-card p-4">
      <div className="flex flex-col gap-1">
        <h3 id="supabase-usage" className="font-title text-lg font-bold">
          {t("title")}
        </h3>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {rows.map((r) => {
          const level = quotaLevel(r.share, thresholds);
          return (
            <li key={r.key} className={`flex flex-col gap-1.5 rounded-control border p-3 ${BORDER[level]}`}>
              <span className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                {t(`metrics.${r.key}`)}
                {r.estimate && <span className="rounded-pill border border-kin px-2 text-kin">{t("estimate")}</span>}
              </span>
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
                    aria-valuenow={r.share === null ? 0 : Math.round(r.share * 100)}
                    className="h-2 overflow-hidden rounded-pill bg-surface-2"
                  >
                    <div className={`h-full origin-left rounded-pill ${BAR[level]}`} style={{ transform: `scaleX(${Math.min(1, r.share ?? 0)})` }} />
                  </div>
                  <span className="text-xs text-text-muted tabular-nums">
                    {r.share === null || r.limit === null
                      ? t("noLimit")
                      : t("ofLimit", { share: t("percent", { value: Math.round(r.share * 100) }), limit: r.limit })}
                  </span>
                </>
              )}
              {r.note && <span className="text-xs text-text-muted">{r.note}</span>}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-2">
        <h4 className="font-title font-bold">{t("tables")}</h4>
        {tables === null ? (
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
                {tables.map((row) => (
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

      <p className="text-xs text-text-muted">
        {t("egressCaveat")}{" "}
        <a href={SUPABASE_USAGE_URL} target="_blank" rel="noopener noreferrer" className="font-bold text-ai underline underline-offset-2">
          {t("dashboardLink")}
        </a>
      </p>
      <p className="text-xs text-text-muted">{t("measuredAt", { at: new Date(measures.measuredAt) })}</p>
    </section>
  );
}
