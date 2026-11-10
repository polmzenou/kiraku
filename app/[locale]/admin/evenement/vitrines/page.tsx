import { getFormatter, getTranslations } from "next-intl/server";
import { SettingLogList } from "@/components/admin/SettingLogList";
import { ShowcaseEventEntries } from "@/components/admin/ShowcaseEventEntries";
import { ShowcaseEventSettingsForm } from "@/components/admin/ShowcaseEventSettingsForm";
import { Link } from "@/i18n/navigation";
import { SHOWCASE_EVENT_SETTING_KEYS, type ShowcaseEventSettings } from "@/lib/settings/showcase-event-form";
import { recentSettingLogs, requireAdmin } from "@/server/admin";
import { getAdminEntries, getShowcaseEventState } from "@/server/event/showcase-queries";
import { getSetting } from "@/server/settings";

/** Event vitrines : visibilité, édition, dates, inscriptions (votes en direct) et retrait de modération. */
export default async function AdminShowcaseEventPage() {
  await requireAdmin();
  const [t, format, values, logs, state] = await Promise.all([
    getTranslations("admin.showcaseEvent"),
    getFormatter(),
    Promise.all(SHOWCASE_EVENT_SETTING_KEYS.map((k) => getSetting(k))),
    recentSettingLogs(["event.showcase."]),
    getShowcaseEventState(),
  ]);
  const settings = Object.fromEntries(SHOWCASE_EVENT_SETTING_KEYS.map((k, i) => [k, values[i]])) as ShowcaseEventSettings;
  const { rows, votes } = await getAdminEntries(state.edition);
  const phase = !state.enabled ? "hidden" : (state.phase ?? "invalid");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
        <p className="text-sm font-bold tabular-nums" role="status">
          {t("current", { phase: t(`phases.${phase}`), edition: state.edition, entries: format.number(rows.length), votes: format.number(votes) })}
        </p>
        <Link href="/event" prefetch={false} className="inline-flex min-h-11 items-center self-start text-sm text-link underline">
          {t(state.enabled ? "open" : "preview")}
        </Link>
      </div>
      <ShowcaseEventSettingsForm initial={settings} />
      <section className="flex flex-col gap-3">
        <h3 className="font-title text-xl font-bold">{t("entriesTitle", { edition: state.edition })}</h3>
        <p className="max-w-prose text-sm text-text-muted">{t("entriesHint")}</p>
        <ShowcaseEventEntries rows={rows} />
      </section>
      <SettingLogList logs={logs} />
    </div>
  );
}
