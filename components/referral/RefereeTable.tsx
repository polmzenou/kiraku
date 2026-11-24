"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import type { RefereeRowView, RefereeStatus } from "@/server/referral/queries";
import { LotGifts } from "./LotGifts";
import { stepNo, type StepConditions } from "./step-meta";
import { StepKnots } from "./StepKnots";
import { StepMeter } from "./StepMeter";

type Filter = "ALL" | "INSTALLED" | "ON_THE_WAY" | "HELD";
const INSTALLED: readonly RefereeStatus[] = ["INSTALLED", "DONE"];
const PAGE = 12;

/** Filleuls (design « tableau ») : compteurs qui filtrent, une ligne par ami avec ses nœuds et sa prochaine étape. */
export function RefereeTable({
  rows,
  totals,
  conditions,
  timeZone,
}: {
  rows: RefereeRowView[];
  totals: { installed: number; onTheWay: number; held: number };
  conditions: StepConditions;
  timeZone: string;
}) {
  const t = useTranslations("referralV2.table");
  const tSteps = useTranslations("referralV2.steps");
  const format = useFormatter();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [all, setAll] = useState(false);
  const list = rows.filter((r) => filter === "ALL" || (filter === "INSTALLED" ? INSTALLED.includes(r.status) : r.status === filter));
  const shown = all || list.length <= PAGE + 3 ? list : list.slice(0, PAGE);

  const counter = (key: Exclude<Filter, "ALL">, value: number, tone: string) => (
    <button
      type="button"
      aria-pressed={filter === key}
      onClick={() => {
        setFilter(filter === key ? "ALL" : key);
        setAll(false);
      }}
      className={`flex min-h-14 flex-col items-center justify-center rounded-card border px-2 py-1.5 ${filter === key ? "border-shu bg-shu/10" : "border-border bg-surface"}`}
    >
      <b className={`font-heading text-xl tabular-nums ${tone}`}>{format.number(value)}</b>
      <span className="text-[11px] text-text-muted">{t(`counter.${key}`, { count: value })}</span>
    </button>
  );

  return (
    <section className="flex flex-col gap-3" aria-label={t("label")}>
      <div className="grid grid-cols-3 gap-2">
        {counter("INSTALLED", totals.installed, "text-hisui")}
        {counter("ON_THE_WAY", totals.onTheWay, "")}
        {counter("HELD", totals.held, "text-shu")}
      </div>
      {filter !== "ALL" && (
        <div className="flex items-center justify-between gap-2 text-xs text-text-muted">
          <span>{t("filtered", { filter, shown: list.length, total: rows.length })}</span>
          <button type="button" onClick={() => setFilter("ALL")} className="min-h-11 px-2 font-bold text-ai">
            {t("showAll")}
          </button>
        </div>
      )}
      <ul className="flex flex-col divide-y divide-border lacquer rounded-card">
        {shown.length === 0 && <li className="p-4 text-sm text-text-muted">{t("empty")}</li>}
        {shown.map((r) => (
          <li key={r.id} className="flex flex-col gap-2 p-3">
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <b className="block truncate">{r.name}</b>
                <span className="block text-xs text-text-muted">
                  {r.status === "BANNED" || r.status === "REVOKED" || r.status === "HELD"
                    ? t(`status.${r.status}`)
                    : r.next
                      ? t("next", { step: tSteps(`${stepNo(r.next.step)}.say`, conditions) })
                      : t(r.done === 4 ? "status.DONE" : "status.NONE")}
                </span>
              </span>
              <StepKnots states={r.steps.map((s) => s.state)} label={t("knots", { done: r.done })} />
            </div>
            {r.next && r.status !== "HELD" && (
              <div className="flex flex-col gap-1.5">
                <StepMeter row={r.next} step={r.next.step} timeZone={timeZone} />
                {r.nextLot && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-text-muted">{t("forYou")}</span>
                    <LotGifts lot={r.nextLot} compact />
                  </div>
                )}
                {r.trustLater && (
                  <div className="flex flex-wrap items-center gap-2 rounded-card border border-kin/40 bg-kin/10 px-2.5 py-2">
                    <span aria-hidden="true" lang="ja" className="font-seal text-base text-kin">信</span>
                    <span className="text-[11px]">{t("trustLater")}</span>
                    <LotGifts lot={r.trustLater} compact />
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
        {shown.length < list.length && (
          <li>
            <button type="button" onClick={() => setAll(true)} className="min-h-11 w-full text-sm font-bold text-ai">
              {t("more", { count: list.length - shown.length })}
            </button>
          </li>
        )}
      </ul>
    </section>
  );
}
