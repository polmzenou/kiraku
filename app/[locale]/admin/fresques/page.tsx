import Image from "next/image";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { CreateFrescoForm } from "@/components/admin/fresco/CreateFrescoForm";
import { FrescoSettingsForm } from "@/components/admin/fresco/FrescoSettingsForm";
import { SettingLogList } from "@/components/admin/SettingLogList";
import { Link } from "@/i18n/navigation";
import { cellCount, DEFAULT_GRID } from "@/lib/fresco/grid";
import type { FrescoSettings } from "@/lib/settings/fresco-form";
import { recentSettingLogs, requireAdmin } from "@/server/admin";
import { listFrescoesAdmin } from "@/server/fresco/admin-queries";
import { getSetting } from "@/server/settings";

/** Fresques : réglages de la chute, nouvelle fresque, et toutes les fresques (brouillons compris). */
export default async function AdminFrescoesPage() {
  // Admin seulement (pas le DEV) : les brouillons et leurs images ne doivent fuiter nulle part
  await requireAdmin();
  const locale = await getLocale();
  const [t, format, enabled, dropRate, newHours, rows, logs] = await Promise.all([
    getTranslations("admin.frescoes"),
    getFormatter(),
    getSetting("fresco.enabled"),
    getSetting("fresco.dropRate"),
    getSetting("fresco.newHours"),
    listFrescoesAdmin(locale),
    recentSettingLogs(["fresco."]),
  ]);
  const settings: FrescoSettings = { "fresco.enabled": enabled, "fresco.dropRate": dropRate, "fresco.newHours": newHours };
  const live = rows.filter((r) => r.status === "PUBLISHED").length;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 font-heading text-2xl font-bold">
          <span aria-hidden="true" lang="ja" className="font-seal text-kin">
            絵
          </span>
          {t("title")}
        </h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
      </div>

      <FrescoSettingsForm initial={settings} cells={cellCount(DEFAULT_GRID)} live={live} />

      <section className="flex flex-col gap-3">
        <h3 className="font-title text-lg font-bold">{t("create.title")}</h3>
        <CreateFrescoForm />
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="font-title text-lg font-bold">{t("list.title")}</h3>
        {rows.length === 0 ? (
          <p className="text-sm text-text-muted">{t("list.empty")}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3">
                <div className="relative aspect-[4/3] overflow-hidden rounded-control bg-surface-2">
                  {r.imageUrl ? (
                    <Image src={r.imageUrl} alt="" fill sizes="(min-width: 1280px) 360px, (min-width: 640px) 45vw, 100vw" className="object-cover" />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-sm text-text-muted">{t("list.noImage")}</span>
                  )}
                </div>
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate font-bold">{r.name}</p>
                  <span className={`shrink-0 rounded-pill border px-2 py-0.5 text-xs font-bold ${r.status === "PUBLISHED" ? "border-hisui text-hisui" : "border-border text-text-muted"}`}>
                    {t(`status.${r.status}`)}
                  </span>
                </div>
                <p className="text-xs text-text-muted">
                  {t("list.pieces", { count: r.pieces, total: r.cells })} · {t("list.owners", { count: r.owners })} · {t("list.completions", { count: r.completions })}
                </p>
                {r.publishedAt && <p className="text-xs text-text-muted">{t("list.published", { date: format.dateTime(r.publishedAt, { dateStyle: "medium" }) })}</p>}
                <Link href={`/admin/fresques/${r.id}`} className="mt-auto inline-flex min-h-11 items-center self-start text-sm text-link underline">
                  {t("list.edit")}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SettingLogList logs={logs} />
    </div>
  );
}
