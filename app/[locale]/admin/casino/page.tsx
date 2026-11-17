import { getFormatter, getTranslations } from "next-intl/server";
import { AdminCancelCoinFlipButton } from "@/components/admin/AdminCancelCoinFlipButton";
import { CasinoSettingsForm } from "@/components/admin/CasinoSettingsForm";
import { SettingLogList } from "@/components/admin/SettingLogList";
import { Link } from "@/i18n/navigation";
import { casinoPhase } from "@/lib/casino/phase";
import { CASINO_FORM_KEYS, type CasinoSettings } from "@/lib/settings/casino-form";
import { recentSettingLogs, requireAdmin } from "@/server/admin";
import { adminOpenTables, casinoStats, escrowHealth } from "@/server/casino/admin";
import { getCasinoRules } from "@/server/casino/queries";
import { getSetting } from "@/server/settings";

/** Casino : ouverture, santé du séquestre, statistiques du pile ou face, tables ouvertes et réglages. */
export default async function AdminCasinoPage() {
  await requireAdmin();
  const now = new Date();
  const [t, tRarity, format, values, rules, health, stats, tables, logs] = await Promise.all([
    getTranslations("admin.casino"),
    getTranslations("rarity"),
    getFormatter(),
    Promise.all(CASINO_FORM_KEYS.map((k) => getSetting(k))),
    getCasinoRules(),
    escrowHealth(now),
    casinoStats(now),
    adminOpenTables(),
    recentSettingLogs(["casino."]),
  ]);
  const settings = Object.fromEntries(CASINO_FORM_KEYS.map((k, i) => [k, values[i]])) as CasinoSettings;
  const phase = casinoPhase(rules, now.getTime());
  const pct = (n: number) => (stats.played > 0 ? format.number(n / stats.played, { style: "percent", maximumFractionDigits: 1 }) : "—");
  const max = Math.max(1, ...stats.perDay.map((d) => d.flips));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
        <p className="text-sm font-bold" role="status">
          {t(phase === "teaser" && rules.opensAt !== null ? "phases.teaserDated" : `phases.${phase}`, {
            date: rules.opensAt !== null ? format.dateTime(new Date(rules.opensAt), { dateStyle: "full", timeStyle: "short" }) : "",
          })}
        </p>
        <Link href="/casino" className="w-fit text-sm text-link underline underline-offset-4">
          {t("preview")}
        </Link>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="casino-escrow">
        <h3 id="casino-escrow" className="font-title text-lg font-bold">
          {t("escrow.title")}
        </h3>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: t("escrow.openTables"), value: format.number(health.openTables) },
            { label: t("escrow.stakedCards"), value: format.number(health.stakedCards) },
            { label: t("escrow.expiredOpen"), value: format.number(health.expiredOpen) },
            { label: t("escrow.status"), value: health.healthy ? t("escrow.healthy") : t("escrow.mismatch") },
          ].map((s) => (
            <div key={s.label} className="lacquer rounded-card p-4">
              <dt className="text-sm text-text-muted">{s.label}</dt>
              <dd className={`text-xl font-bold tabular-nums ${health.healthy ? "text-kin" : "text-shu"}`}>{s.value}</dd>
            </div>
          ))}
        </dl>
        {!health.healthy && (
          <p role="alert" className="max-w-prose text-sm font-bold text-shu">
            {t("escrow.mismatchHint")}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="casino-stats">
        <h3 id="casino-stats" className="font-title text-lg font-bold">
          {t("stats.title")}
        </h3>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: t("stats.played"), value: format.number(stats.played) },
            { label: t("stats.split"), value: `表 ${pct(stats.omote)} · 裏 ${pct(stats.ura)}` },
            { label: t("stats.creatorWins"), value: pct(stats.creatorWins) },
            { label: t("stats.closed"), value: t("stats.closedValue", { cancelled: stats.cancelled, expired: stats.expired }) },
          ].map((s) => (
            <div key={s.label} className="lacquer rounded-card p-4">
              <dt className="text-sm text-text-muted">{s.label}</dt>
              <dd className="text-lg font-bold tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
        {stats.perDay.length > 0 && (
          <figure className="flex flex-col gap-2 lacquer rounded-card p-4">
            <figcaption className="text-sm text-text-muted">{t("stats.perDay")}</figcaption>
            <ul className="flex flex-col gap-1">
              {stats.perDay.map((d) => (
                <li key={d.day} className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-2 text-sm tabular-nums">
                  <span className="text-text-muted">{d.day}</span>
                  <span className="h-2 rounded-full bg-surface-2" aria-hidden="true">
                    <span className="block h-2 origin-left rounded-full bg-kin" style={{ transform: `scaleX(${d.flips / max})` }} />
                  </span>
                  <span className="text-right">{d.flips}</span>
                </li>
              ))}
            </ul>
          </figure>
        )}
        {stats.byRarity.length > 0 && (
          <p className="text-sm text-text-muted">
            {t("stats.byRarity")}{" "}
            {stats.byRarity.map((r) => `${tRarity(r.rarity as "COMMON")} ${r.flips}`).join(" · ")}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="casino-tables">
        <h3 id="casino-tables" className="font-title text-lg font-bold">
          {t("tables.title")}
        </h3>
        {tables.length === 0 ? (
          <p className="text-sm text-text-muted">{t("tables.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tables.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-2 rounded-control border border-border bg-surface p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <Link href={`/casino/pile-ou-face/${row.id}`} className="font-bold text-link underline underline-offset-4">
                    {t("tables.row", { card: row.cardName, rarity: tRarity(row.rarity as "COMMON"), name: row.creatorName })}
                  </Link>
                  <span className="text-xs text-text-muted">
                    {row.reservedForName ? `${t("tables.reservedFor", { name: row.reservedForName })} · ` : ""}
                    {t("tables.expiresAt", { date: format.dateTime(row.expiresAt, { dateStyle: "short", timeStyle: "short" }) })}
                  </span>
                </div>
                <AdminCancelCoinFlipButton flipId={row.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <CasinoSettingsForm initial={settings} />
      <SettingLogList logs={logs} />
    </div>
  );
}
