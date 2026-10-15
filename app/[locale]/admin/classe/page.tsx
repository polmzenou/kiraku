import { getLocale, getTranslations } from "next-intl/server";
import { CloseSeasonButton } from "@/components/admin/CloseSeasonButton";
import { RankedSettingsForm } from "@/components/admin/RankedSettingsForm";
import { RankEmblem } from "@/components/ranked/RankEmblem";
import { BOARD_TIERS } from "@/lib/battle/tiers";
import { RANKED_FORM_KEYS, type RankedSettings } from "@/lib/settings/ranked-form";
import { recentSettingLogs, requireAdmin } from "@/server/admin";
import { lotOptions } from "@/server/economy/admin-queries";
import { ensureSeason, getRankedRules, rankedTotals } from "@/server/ranked/queries";
import { getSetting } from "@/server/settings";

/** Classé : saison en cours (clôture anticipée), galerie des emblèmes et réglages ranked.*. */
export default async function AdminRankedPage() {
  await requireAdmin();
  const locale = await getLocale();
  const rules = await getRankedRules();
  const [t, tRanked, values, lots, logs, season, { players, games, grand }] = await Promise.all([
    getTranslations("admin.ranked"),
    getTranslations("ranked"),
    Promise.all(RANKED_FORM_KEYS.map((k) => getSetting(k))),
    lotOptions(locale),
    recentSettingLogs(["ranked."]),
    ensureSeason(rules),
    rankedTotals(new Date()),
  ]);
  const settings = Object.fromEntries(RANKED_FORM_KEYS.map((k, i) => [k, values[i]])) as RankedSettings;

  const stats = [
    { label: t("players"), value: t("count", { count: players }) },
    { label: t("games"), value: t("count", { count: games }) },
    { label: t("grand"), value: t("count", { count: grand }) },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="font-title text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
      </div>

      {season && (
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <h3 className="font-title text-lg font-bold">{t("season")}</h3>
          <p className="text-sm">{t("seasonInfo", { number: season.number, date: season.endsAt })}</p>
          <div className="flex flex-wrap items-center gap-3">
            <CloseSeasonButton number={season.number} />
          </div>
        </section>
      )}

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-surface p-4">
            <dt className="text-sm text-text-muted">{s.label}</dt>
            <dd className="text-xl font-bold tabular-nums text-kin">{s.value}</dd>
          </div>
        ))}
      </dl>

      <section className="flex flex-col gap-3">
        <h3 className="font-title text-lg font-bold">{t("gallery")}</h3>
        <ul className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-[#15120f] p-4 sm:grid-cols-4 lg:grid-cols-7">
          {BOARD_TIERS.map((tier) => (
            <li key={tier} className="flex flex-col items-center gap-2 text-center text-sm text-washi-paper">
              <RankEmblem tier={tier} division={tier === "GRAND_CHAMPION" ? null : 2} size={88} label={tRanked(`tiers.${tier}`)} />
              <span className="font-bold">{tRanked(`tiers.${tier}`)}</span>
            </li>
          ))}
        </ul>
      </section>

      <RankedSettingsForm initial={settings} lots={lots.map((l) => ({ id: l.id, name: l.name }))} />

      <section className="flex flex-col gap-3">
        <h3 className="font-title text-lg font-bold">{t("log")}</h3>
        {logs.length === 0 ? (
          <p className="text-sm text-text-muted">{t("logEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {logs.map((log) => (
              <li key={log.id} className="flex flex-col gap-1 rounded-button border border-border bg-surface p-3 text-sm">
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
