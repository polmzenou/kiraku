import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ReferralAdminTabs } from "@/components/admin/referral/ReferralAdminTabs";
import { TrackingStatusPill } from "@/components/admin/referral/TrackingStatusPill";
import { ResponsiveTable, type TableColumn } from "@/components/admin/ResponsiveTable";
import { StepKnots } from "@/components/referral/StepKnots";
import { Link } from "@/i18n/navigation";
import { requireAdminView } from "@/server/admin";
import { heldReferralCount } from "@/server/referral/admin-queries";
import { referralV2Rules } from "@/server/referral/deps";
import { TRACKING_FILTERS, trackingRows, trackingStats, type TrackingFilter } from "@/server/referral/tracking-queries";
import { getSetting } from "@/server/settings";

type Column = "referee" | "referrer" | "steps" | "status" | "trust" | "last";

/**
 * Suivi du parrainage v2 (design « tableau » de l'atelier équipe) : indicateurs, filtres par statut, recherche d'un
 * joueur, d'un code ou d'un id, puis un parrainage par ligne, qui ouvre sa fiche. Toute l'équipe (ADMIN et DEV).
 */
export default async function AdminReferralTrackingPage({ searchParams }: PageProps<"/[locale]/admin/parrainage/suivi">) {
  await requireAdminView();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const rawFilter = one(sp.statut);
  const filter: TrackingFilter = (TRACKING_FILTERS as readonly string[]).includes(rawFilter) ? (rawFilter as TrackingFilter) : "ALL";
  const q = one(sp.q).slice(0, 40);
  const now = new Date();
  const [t, format, locale, rules, timeZone, held] = await Promise.all([
    getTranslations("admin.referralV2.tracking"),
    getFormatter(),
    getLocale(),
    referralV2Rules(),
    getSetting("game.timeZone"),
    heldReferralCount(),
  ]);
  const [stats, { rows, more }] = await Promise.all([trackingStats(timeZone, locale, now), trackingRows(filter, q, rules)]);

  const kpis: { value: string; label: string; tone?: string }[] = [
    { value: format.number(stats.counts.ALL), label: t("kpi.total") },
    { value: format.number(stats.counts.INSTALLED + stats.counts.HOOKED + stats.counts.LOYAL), label: t("kpi.installed"), tone: "text-hisui" },
    { value: format.number(stats.counts.LOYAL), label: t("kpi.loyal") },
    { value: format.number(stats.counts.HELD), label: t("kpi.held"), tone: stats.counts.HELD > 0 ? "text-shu" : "" },
    { value: `${format.number(stats.payoutsToday)} · ${format.number(stats.payoutsWeek)}`, label: t("kpi.payouts"), tone: "text-kin" },
    { value: format.number(stats.boosters), label: t("kpi.boosters") },
    { value: format.number(stats.zeni), label: t("kpi.zeni") },
  ];
  const href = (next: TrackingFilter) => ({ pathname: "/admin/parrainage/suivi" as const, query: { ...(next !== "ALL" && { statut: next }), ...(q && { q }) } });

  const columns: TableColumn<Column>[] = [
    { key: "referee", label: t("col.referee"), primary: true },
    { key: "referrer", label: t("col.referrer") },
    { key: "steps", label: t("col.steps") },
    { key: "status", label: t("col.status") },
    { key: "trust", label: t("col.trust") },
    { key: "last", label: t("col.last") },
  ];
  const tableRows = rows.map((r) => ({
    id: r.id,
    cells: {
      referee: (
        <Link href={`/admin/parrainage/suivi/${r.id}`} className="font-bold text-link underline underline-offset-4">
          {r.referee.name}
        </Link>
      ),
      referrer: r.referrer.name,
      steps: <StepKnots states={r.knots} label={t("knots", { done: r.knots.filter((k) => k !== "LOCKED").length })} />,
      status: <TrackingStatusPill status={r.status} />,
      trust: <span className={r.trust === "HIGH" ? "text-hisui" : "text-kin"}>{t(`trust.${r.trust}`)}</span>,
      last: r.last ? (
        <span className="flex flex-col">
          <b className={r.last.clawedBack ? "line-through" : ""}>
            {t("lastKind", { kind: r.last.kind, step: String(r.last.step ?? 0), milestone: r.last.milestone ?? 0 })}
          </b>
          <span className="text-xs text-text-muted">
            {format.relativeTime(new Date(r.last.at), now)}
            {r.last.clawedBack && ` · ${t("clawedBack")}`}
          </span>
        </span>
      ) : (
        <span className="text-xs text-text-muted">{t("noPayout")}</span>
      ),
    },
  }));

  return (
    <div className="flex flex-col gap-6">
      <ReferralAdminTabs active="tracking" held={held} />
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
      </div>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {kpis.map((k) => (
          <li key={k.label} className="flex flex-col gap-0.5 lacquer rounded-card p-3">
            <b className={`font-heading text-xl tabular-nums ${k.tone ?? ""}`}>{k.value}</b>
            <span className="text-xs text-text-muted">{k.label}</span>
          </li>
        ))}
        {stats.byType.length > 0 && (
          <li className="flex flex-col gap-0.5 lacquer rounded-card p-3">
            <span className="text-xs text-text-muted">{t("kpi.byType")}</span>
            <span className="text-sm">
              {stats.byType
                .slice(0, 3)
                .map((b) => `${format.number(b.count)} ${b.name}`)
                .join(" · ")}
            </span>
          </li>
        )}
      </ul>

      <div className="flex flex-col gap-3">
        <nav aria-label={t("filters")} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {TRACKING_FILTERS.map((f) => (
            <Link
              key={f}
              href={href(f)}
              aria-current={f === filter ? "page" : undefined}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-pill border border-border bg-surface px-4 text-sm font-bold text-text-muted aria-[current=page]:border-shu aria-[current=page]:bg-shu/15 aria-[current=page]:text-text"
            >
              {t(`filter.${f}`)}
              <span className="tabular-nums text-xs text-text-muted">{format.number(stats.counts[f])}</span>
            </Link>
          ))}
        </nav>
        <form role="search" className="flex flex-wrap gap-2">
          {filter !== "ALL" && <input type="hidden" name="statut" value={filter} />}
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="sr-only">{t("search")}</span>
            <input
              type="search"
              name="q"
              defaultValue={q}
              maxLength={40}
              placeholder={t("searchPlaceholder")}
              className="min-h-11 rounded-control border border-border bg-surface px-3 text-sm"
            />
          </label>
          <button type="submit" className="min-h-11 rounded-pill border border-border bg-surface-2 px-4 text-sm font-bold">
            {t("searchSubmit")}
          </button>
        </form>
      </div>

      {rows.length === 0 ? (
        <p className="lacquer rounded-card p-6 text-center text-sm text-text-muted">{stats.counts.ALL === 0 ? t("emptyAll") : t("empty")}</p>
      ) : (
        <ResponsiveTable columns={columns} rows={tableRows} caption={t("title")} />
      )}
      {more && <p className="text-xs text-text-muted">{t("more")}</p>}
    </div>
  );
}
