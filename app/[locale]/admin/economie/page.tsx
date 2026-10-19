import { getLocale, getTranslations } from "next-intl/server";
import { EconomySettingsForm } from "@/components/admin/EconomySettingsForm";
import { ECONOMY_SETTING_KEYS, type EconomySettings } from "@/lib/settings/economy-form";
import { recentSettingLogs, requireAdmin } from "@/server/admin";
import { economyTotals, flowsLastDay, ledgerMismatches, lotOptions } from "@/server/economy/admin-queries";
import { marketTotals } from "@/server/market/queries";
import { getSetting } from "@/server/settings";

/** Économie : interrupteurs, parrainage, Zeni en circulation et contrôle d'intégrité du journal. */
export default async function AdminEconomyPage() {
  await requireAdmin();
  const locale = await getLocale();
  const [t, tReason, values, totals, mismatches, flows, lots, logs, market] = await Promise.all([
    getTranslations("admin.economy"),
    getTranslations("economy.ledger.reasons"),
    Promise.all(ECONOMY_SETTING_KEYS.map((k) => getSetting(k))),
    economyTotals(),
    ledgerMismatches(),
    flowsLastDay(),
    lotOptions(locale),
    recentSettingLogs(["missions.", "shop.", "referral."]),
    marketTotals(new Date()),
  ]);
  const settings = Object.fromEntries(ECONOMY_SETTING_KEYS.map((k, i) => [k, values[i]])) as EconomySettings;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="font-title text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface p-4">
          <dt className="text-sm text-text-muted">{t("circulating")}</dt>
          <dd className="text-xl font-bold tabular-nums text-kin">{t("zeni", { amount: totals.circulating })}</dd>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <dt className="text-sm text-text-muted">{t("ledgerSum")}</dt>
          <dd className="text-xl font-bold tabular-nums">{t("zeni", { amount: totals.ledger })}</dd>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <dt className="text-sm text-text-muted">{t("escrow")}</dt>
          <dd className="text-xl font-bold tabular-nums">{t("zeni", { amount: market.escrow })}</dd>
          <p className="mt-1 text-xs text-text-muted">{t("escrowHint")}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <dt className="text-sm text-text-muted">{t("integrity")}</dt>
          <dd className={`text-xl font-bold ${mismatches.length === 0 ? "text-kin" : "text-shu"}`}>
            {mismatches.length === 0 ? t("integrityOk") : t("integrityKo", { count: mismatches.length })}
          </dd>
        </div>
      </dl>

      {mismatches.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="font-bold text-shu">{t("mismatches")}</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {mismatches.map((m) => (
              <li key={m.id} className="rounded-control border border-shu bg-surface p-2">
                {t("mismatch", { name: m.username, coins: m.coins, ledger: Number(m.ledger) })}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="font-title text-lg font-bold">{t("flows")}</h3>
        {flows.length === 0 ? (
          <p className="text-sm text-text-muted">{t("flowsEmpty")}</p>
        ) : (
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {flows.map((f) => (
              <li key={f.reason} className="flex justify-between gap-2 rounded-control border border-border bg-surface p-2">
                <span>{tReason(f.reason)}</span>
                <span className="tabular-nums">{t("flow", { amount: f.amount, count: f.count })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <EconomySettingsForm initial={settings} lots={lots} />

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
