"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  DEFAULT_HOURS_PER_PLAYER,
  DEFAULT_OTHER_PER_DAY,
  SCREENS,
  invocationsPerHour,
  maxDailyPlayers,
  monthlyProjection,
  type PollSettings,
  type VercelBudget,
} from "@/lib/usage/estimate";
import { quotaLevel, type AlertThresholds } from "@/lib/usage/quota";
import { NumberField } from "./fields";

/**
 * Consommation Vercel estimée à partir des réglages de sondage en cours : par écran pour un joueur
 * actif, puis sur 30 jours face au budget mensuel réglé (plan Pro : crédit de 20 $). Les hypothèses
 * restent dans la page (rien n'est enregistré).
 */
export function UsageEstimate({
  settings,
  observedPlayers,
  budget,
  thresholds,
}: {
  settings: PollSettings;
  observedPlayers: number;
  budget: VercelBudget;
  thresholds: AlertThresholds;
}) {
  const t = useTranslations("admin.usage");
  const [players, setPlayers] = useState(Math.max(1, observedPlayers));
  const [hours, setHours] = useState(DEFAULT_HOURS_PER_PLAYER);
  const [other, setOther] = useState(DEFAULT_OTHER_PER_DAY);
  const valid = [players, hours, other].every((v) => Number.isInteger(v) && v >= 0);
  const p = monthlyProjection({ settings, dailyPlayers: valid ? players : 0, hoursPerPlayer: valid ? hours : 0, otherPerDay: valid ? other : 0, budget });
  const capacity = valid ? maxDailyPlayers(settings, hours, other, budget) : 0;
  const pct = (share: number) => t("percent", { value: Math.round(share * 100) });
  const rows = [
    { key: "invocations", value: t("invocations", { value: p.invocations }), limit: t("invocations", { value: budget.invocations }), share: p.share.invocations },
    { key: "cpu", value: t("hours", { value: p.cpuHours.toFixed(1) }), limit: t("hours", { value: budget.cpuHours }), share: p.share.cpuHours },
    { key: "transfer", value: t("gb", { value: p.transferGb.toFixed(1) }), limit: t("gb", { value: budget.transferGb }), share: p.share.transferGb },
  ] as const;
  const border = { critical: "border-shu", warn: "border-kin", ok: "border-border", unknown: "border-border" } as const;

  return (
    <section aria-labelledby="usage-estimate" className="flex flex-col gap-4 lacquer rounded-card p-4">
      <div className="flex flex-col gap-1">
        <h3 id="usage-estimate" className="font-title text-lg font-bold">
          {t("title")}
        </h3>
        <p className="max-w-prose text-sm text-text-muted">{t(settings.ablyEnabled ? "introRealtime" : "introPolling")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <NumberField label={t("players")} hint={t("playersHint", { count: observedPlayers })} value={players} onChange={setPlayers} min={0} max={1_000_000} />
        <NumberField label={t("hoursPerPlayer")} value={hours} onChange={setHours} min={0} max={24} />
        <NumberField label={t("otherPerDay")} hint={t("otherHint")} value={other} onChange={setOther} min={0} max={10_000_000} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[18rem] text-sm tabular-nums">
          <caption className="sr-only">{t("perScreen")}</caption>
          <thead>
            <tr className="text-left text-text-muted">
              <th scope="col" className="py-1 pr-3 font-normal">{t("screen")}</th>
              <th scope="col" className="py-1 text-right font-normal">{t("perHour")}</th>
            </tr>
          </thead>
          <tbody>
            {SCREENS.map((s) => (
              <tr key={s} className="border-t border-border">
                <th scope="row" className="py-1.5 pr-3 text-left font-normal">{t(`screens.${s}`)}</th>
                <td className="py-1.5 text-right">{t("invocations", { value: Math.round(invocationsPerHour(s, settings)) })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="grid gap-2 sm:grid-cols-3">
        {rows.map((r) => (
          <li key={r.key} className={`flex flex-col gap-0.5 rounded-control border p-3 ${border[quotaLevel(r.share, thresholds)]}`}>
            <span className="text-xs text-text-muted">{t(`metrics.${r.key}`)}</span>
            <span className="text-lg font-bold tabular-nums">{r.value}</span>
            <span className="text-xs text-text-muted tabular-nums">{t("ofLimit", { share: pct(r.share), limit: r.limit })}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm">{t("capacity", { count: capacity, hours })}</p>
      <p className="text-xs text-text-muted">{t("caveat")}</p>
    </section>
  );
}
