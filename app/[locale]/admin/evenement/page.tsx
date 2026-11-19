import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { EventGaugeSettingsForm } from "@/components/admin/EventGaugeSettingsForm";
import { ReadOnly } from "@/components/admin/ReadOnly";
import { SettingLogList } from "@/components/admin/SettingLogList";
import { EVENT_GAUGE_SETTING_KEYS, type EventGaugeSettings } from "@/lib/settings/event-gauge-form";
import { recentSettingLogs, requireAdminView } from "@/server/admin";
import { lotOptions } from "@/server/economy/admin-queries";
import { readEventGauge } from "@/server/home/event-gauge";
import { getSetting } from "@/server/settings";

/** Jauge communautaire de l'accueil : fenêtre, objectif, interrupteur et compte actuel. */
export default async function AdminEventGaugePage() {
  const { readOnly } = await requireAdminView();
  const [t, format, values, logs, gauge, lots] = await Promise.all([
    getTranslations("admin.eventGauge"),
    getFormatter(),
    Promise.all(EVENT_GAUGE_SETTING_KEYS.map((k) => getSetting(k))),
    recentSettingLogs(["home.eventGauge."]),
    readEventGauge(),
    getLocale().then(lotOptions),
  ]);
  const settings = Object.fromEntries(EVENT_GAUGE_SETTING_KEYS.map((k, i) => [k, values[i]])) as EventGaugeSettings;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
        {gauge && (
          <p className="text-sm font-bold tabular-nums" role="status">
            {t("current", { phase: t(`phases.${gauge.phase}`), count: format.number(gauge.count), goal: format.number(gauge.goal), percent: gauge.percent })}
          </p>
        )}
      </div>
      <ReadOnly when={readOnly}>
        <EventGaugeSettingsForm initial={settings} lots={lots} reached={gauge?.reached ?? false} />
      </ReadOnly>
      <SettingLogList logs={logs} />
    </div>
  );
}
