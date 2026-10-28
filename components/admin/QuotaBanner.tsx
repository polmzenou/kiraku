import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { usageAlerts } from "@/server/admin/host-usage";

/**
 * Bandeau en tête de toutes les pages /admin : orange dès qu'une consommation dépasse le premier
 * seuil, rouge au second (réglage usage.alertThresholds). Rien si tout va bien ou si la mesure a
 * échoué : il ne gêne jamais l'admin. Mesures du serveur (server/admin/host-usage.ts).
 */
export async function QuotaBanner() {
  const res = await usageAlerts();
  if (!res?.worst) return null;
  const t = await getTranslations("admin.usage.banner");
  const critical = res.worst === "critical";
  return (
    <div
      role={critical ? "alert" : "status"}
      className={`flex flex-col gap-2 rounded-card border-2 p-4 text-sm sm:flex-row sm:items-center sm:justify-between ${critical ? "border-shu bg-shu/15" : "border-kin bg-kin/15"}`}
    >
      <div className="flex flex-col gap-1">
        <p className="font-bold">{t(critical ? "critical" : "warn")}</p>
        <ul className="flex flex-wrap gap-x-3 gap-y-1">
          {res.alerts.map((a) => (
            <li key={a.key} className="tabular-nums">
              {t("item", { metric: t(`metrics.${a.key}`), percent: Math.round(a.share * 100) })}
            </li>
          ))}
        </ul>
      </div>
      <Link href="/admin/general#usage" className="inline-flex min-h-11 shrink-0 items-center font-bold underline underline-offset-2">
        {t("details")}
      </Link>
    </div>
  );
}
