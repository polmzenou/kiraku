import { getTranslations } from "next-intl/server";
import { CombatSettingsForm } from "@/components/admin/CombatSettingsForm";
import { COMBAT_SETTING_KEYS, type CombatSettings } from "@/lib/settings/combat-form";
import { recentSettingLogs, requireAdmin } from "@/server/admin";
import { combatTotals } from "@/server/battle/queries";
import { getSetting } from "@/server/settings";

/** Combat : santé (parties, salles, file, gains du jour) et réglages battle.*. */
export default async function AdminCombatPage() {
  await requireAdmin();
  const [t, values, totals, logs] = await Promise.all([
    getTranslations("admin.combat"),
    Promise.all(COMBAT_SETTING_KEYS.map((k) => getSetting(k))),
    combatTotals(new Date()),
    recentSettingLogs(["battle."]),
  ]);
  const settings = Object.fromEntries(COMBAT_SETTING_KEYS.map((k, i) => [k, values[i]])) as CombatSettings;

  const stats = [
    { label: t("active"), value: t("count", { count: totals.active }) },
    { label: t("waiting"), value: t("count", { count: totals.waiting }) },
    { label: t("queued"), value: t("count", { count: totals.queued }) },
    { label: t("finished24h"), value: t("count", { count: totals.finished24h }) },
    { label: t("bots24h"), value: t("count", { count: totals.bots24h }) },
    { label: t("rewards24h"), value: t("zeni", { amount: totals.rewards24h }) },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="lacquer rounded-card p-4">
            <dt className="text-sm text-text-muted">{s.label}</dt>
            <dd className="text-xl font-bold tabular-nums text-kin">{s.value}</dd>
          </div>
        ))}
      </dl>

      <CombatSettingsForm initial={settings} />

      <section className="flex flex-col gap-3">
        <h3 className="font-title text-lg font-bold">{t("log")}</h3>
        {logs.length === 0 ? (
          <p className="text-sm text-text-muted">{t("logEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {logs.map((log) => (
              <li key={log.id} className="flex flex-col gap-1 rounded-control border border-border bg-surface p-3 text-sm">
                <span className="font-bold">{t("logEntry", { key: log.targetId ?? "", admin: log.admin.username })}</span>
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
