import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { SettingLogList } from "@/components/admin/SettingLogList";
import { WrappedSettingsForm } from "@/components/admin/WrappedSettingsForm";
import { inputClass } from "@/components/ui/Field";
import { WrappedView } from "@/components/wrapped/WrappedView";
import { localePath } from "@/lib/seo/alternates";
import { WRAPPED_SETTING_KEYS, type WrappedSettings } from "@/lib/settings/wrapped-form";
import { recentSettingLogs, requireAdmin } from "@/server/admin";
import { getSetting } from "@/server/settings";
import { getWrappedByUsername, getWrappedPhase } from "@/server/wrapped/queries";

/**
 * Wrapped de l'année : réglages (livré éteint) et aperçu du diaporama et de l'image pour n'importe quel
 * pseudo, même éteint. Par défaut, l'aperçu montre le Wrapped de l'admin connecté.
 */
export default async function AdminWrappedPage({ searchParams }: PageProps<"/[locale]/admin/wrapped">) {
  const admin = await requireAdmin();
  const raw = (await searchParams).u;
  const requested = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const username = /^[A-Za-z0-9_.-]{1,40}$/.test(requested) ? requested : admin.username;
  const [t, format, locale, values, logs, { settings, phase }] = await Promise.all([
    getTranslations("admin.wrapped"),
    getFormatter(),
    getLocale(),
    Promise.all(WRAPPED_SETTING_KEYS.map((k) => getSetting(k))),
    recentSettingLogs(["wrapped."]),
    getWrappedPhase(),
  ]);
  const initial = Object.fromEntries(WRAPPED_SETTING_KEYS.map((k, i) => [k, values[i]])) as WrappedSettings;
  const summary = await getWrappedByUsername(username, settings.year);
  const current = locale === "en" ? "en" : "fr";
  const imageSrc = `${localePath("/wrapped/image", current)}?u=${encodeURIComponent(username)}`;
  const opens = format.dateTime(new Date(settings.opensAt), { dateStyle: "long", timeStyle: "short" });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
        <p role="status" className="text-sm font-bold">
          {t("phase", { phase: t(`phases.${phase}`) })}
          {phase === "before" && <span className="font-normal text-text-muted"> · {opens}</span>}
        </p>
      </div>

      <WrappedSettingsForm initial={initial} />

      <section aria-labelledby="wrapped-preview" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 id="wrapped-preview" className="font-title text-xl font-bold">{t("preview")}</h3>
          <p className="text-sm text-text-muted">{t("previewHint")}</p>
        </div>
        <form className="flex max-w-md items-end gap-2">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            {t("previewUser")}
            <input name="u" defaultValue={username} maxLength={40} className={inputClass} />
          </label>
          <button type="submit" className="min-h-11 rounded-pill px-5 text-sm font-bold lacquer">{t("previewShow")}</button>
        </form>

        {!summary ? (
          <p className="text-sm text-text-muted">{t("previewMissing", { name: username })}</p>
        ) : summary.boosters.opened === 0 ? (
          <p className="text-sm text-text-muted">{t("previewEmpty", { name: username, year: settings.year })}</p>
        ) : (
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <WrappedView summary={summary} locale={locale} imageSrc={imageSrc} embedded />
            <figure className="flex flex-col gap-2">
              <figcaption className="text-sm font-bold">{t("image")}</figcaption>
              {/* eslint-disable-next-line @next/next/no-img-element -- image générée à la volée, réservée à l'admin */}
              <img src={imageSrc} alt="" width={1080} height={1920} className="h-auto w-[300px] max-w-full rounded-card shadow-raised" />
              <a href={imageSrc} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center text-sm text-link underline underline-offset-4">
                {t("openImage")}
              </a>
            </figure>
          </div>
        )}
      </section>

      <SettingLogList logs={logs} />
    </div>
  );
}
