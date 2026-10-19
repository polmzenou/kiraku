import { getFormatter, getTranslations } from "next-intl/server";
import { DataRequestActions } from "@/components/admin/DataRequestActions";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/server/admin";
import { DATA_REQUEST_FILTERS, listDataRequests, parseDataRequestFilter } from "@/server/admin/data-requests";

/** Données personnelles : demandes de suppression (échéance, exécuter, annuler) et exports, avec historique. */
export default async function AdminDataPage({ searchParams }: PageProps<"/[locale]/admin/donnees">) {
  await requireAdmin();
  const sp = await searchParams;
  const filter = parseDataRequestFilter(Array.isArray(sp.filtre) ? sp.filtre[0] : sp.filtre);
  const [t, format, { items, pending }] = await Promise.all([
    getTranslations("admin.data"),
    getFormatter(),
    listDataRequests(filter),
  ]);
  const when = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-title text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
        <p className="text-sm font-bold tabular-nums">{t("pendingCount", { count: pending })}</p>
      </div>

      <nav aria-label={t("filters")} className="flex gap-1 overflow-x-auto border-b border-border">
        {DATA_REQUEST_FILTERS.map((f) => (
          <Link
            key={f}
            href={{ pathname: "/admin/donnees", query: f === "pending" ? {} : { filtre: f } }}
            aria-current={filter === f ? "page" : undefined}
            className={`flex min-h-11 items-center border-b-[3px] px-3 text-sm font-bold whitespace-nowrap ${
              filter === f ? "border-shu text-text" : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            {t(`filter.${f}`)}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <p className="text-sm text-text-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-2 rounded-control border border-border bg-surface p-3 text-sm md:flex-row md:items-center md:justify-between"
            >
              <div className="flex flex-col gap-0.5">
                <p>
                  <Link href={`/admin/utilisateurs/${r.user.id}`} className="font-bold underline-offset-4 hover:underline">
                    {r.user.username}
                  </Link>{" "}
                  <span className="text-text-muted">
                    · {t(`kinds.${r.kind}`)} · {t(`statuses.${r.status}`)}
                  </span>
                </p>
                <p className="text-text-muted">
                  {t("requestedAt", { date: when(r.requestedAt) })}
                  {r.dueAt && r.status === "PENDING" && <> · {t("dueAt", { date: format.dateTime(r.dueAt, { dateStyle: "medium" }) })}</>}
                  {r.processedAt && (
                    <>
                      {" · "}
                      {t("processedAt", { date: when(r.processedAt) })}
                      {r.processedBy && <> ({r.processedBy.username})</>}
                    </>
                  )}
                </p>
              </div>
              {r.kind === "DELETION" && r.status === "PENDING" && !r.user.anonymizedAt && (
                <DataRequestActions userId={r.user.id} username={r.user.username} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
