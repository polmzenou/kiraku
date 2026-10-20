import { getFormatter, getTranslations } from "next-intl/server";
import { AdminReviewActions } from "@/components/admin/AdminReviewActions";
import { Stars } from "@/components/home/Stars";
import { PlayerAvatar } from "@/components/social/PlayerAvatar";
import { Link } from "@/i18n/navigation";
import {
  ADMIN_REVIEW_FILTERS,
  pageCount,
  parseAdminReviewFilter,
  parseAdminReviewPage,
  REVIEW_MAX_PINNED,
  type AdminReviewFilter,
} from "@/lib/admin/reviews";
import { requireAdmin } from "@/server/admin";
import { listReviewsForAdmin, recentReviewModeration } from "@/server/social/reviews-admin";

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

const LOG_ACTIONS = ["REVIEW_HIDE", "REVIEW_SHOW", "REVIEW_PIN", "REVIEW_UNPIN", "REVIEW_REPLY", "REVIEW_REPLY_DELETE"] as const;
const logKey = (action: string) =>
  (LOG_ACTIONS as readonly string[]).includes(action) ? (action as (typeof LOG_ACTIONS)[number]) : "OTHER";

function href(filter: AdminReviewFilter, page: number) {
  const query: Record<string, string> = {};
  if (filter !== "all") query.filtre = filter;
  if (page > 0) query.page = String(page);
  return { pathname: "/admin/avis", query };
}

/** Avis : liste paginée (masqués compris), filtres, masquer, épingler en tête de l'accueil, répondre. */
export default async function AdminReviewsPage({ searchParams }: PageProps<"/[locale]/admin/avis">) {
  await requireAdmin();
  const sp = await searchParams;
  const filter = parseAdminReviewFilter(one(sp.filtre));
  const page = parseAdminReviewPage(one(sp.page));
  const [t, format, { items, total, counts }, logs] = await Promise.all([
    getTranslations("admin.reviews"),
    getFormatter(),
    listReviewsForAdmin(filter, page),
    recentReviewModeration(),
  ]);
  const pages = pageCount(total);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-title text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
        <p className="text-sm font-bold tabular-nums">{t("pinnedCount", { count: counts.pinned, max: REVIEW_MAX_PINNED })}</p>
      </div>

      <nav aria-label={t("filters")} className="flex gap-1 overflow-x-auto border-b border-border">
        {ADMIN_REVIEW_FILTERS.map((f) => (
          <Link
            key={f}
            href={href(f, 0)}
            aria-current={filter === f ? "page" : undefined}
            className={`flex min-h-11 items-center gap-1.5 border-b-[3px] px-3 text-sm font-bold whitespace-nowrap ${
              filter === f ? "border-shu text-text" : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            {t(`filter.${f}`)}
            <span className="text-xs font-normal tabular-nums text-text-muted">{format.number(counts[f])}</span>
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <p className="text-sm text-text-muted">{t(`empty.${filter}`)}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((r) => (
            <li
              key={r.id}
              className={`flex flex-col gap-3 rounded-control border border-border p-3 text-sm sm:flex-row sm:items-start sm:justify-between ${
                r.hidden ? "bg-surface-2" : "bg-surface"
              }`}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex items-center gap-2">
                  <PlayerAvatar username={r.user.username} image={r.user.image} size={32} />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-bold">{r.user.username}</span>
                    <Stars rating={r.rating} label={t("ratingLabel", { rating: r.rating })} size={14} />
                  </div>
                </div>
                <p className="break-words whitespace-pre-line">{r.body}</p>
                {r.reply && (
                  <div className="flex flex-col gap-1 border-l-2 border-kin pl-3">
                    <span className="text-xs font-bold text-kin">{t("replyFrom")}</span>
                    <p className="break-words whitespace-pre-line text-text-muted">{r.reply}</p>
                  </div>
                )}
                <p className="flex flex-wrap gap-x-2 text-xs text-text-muted">
                  <time dateTime={r.updatedAt.toISOString()}>
                    {format.dateTime(r.updatedAt, { dateStyle: "short", timeStyle: "short" })}
                  </time>
                  {r.updatedAt.getTime() - r.createdAt.getTime() > 1000 && <span>{t("edited")}</span>}
                  {r.repliedAt && r.updatedAt > r.repliedAt && <span className="font-bold">{t("editedAfterReply")}</span>}
                  {r.pinned && <span className="font-bold text-kin">{t("pinnedBadge")}</span>}
                  {r.hidden && <span className="font-bold text-shu">{t("hiddenBadge")}</span>}
                  {r.user.bannedAt && <span className="font-bold text-shu">{t("bannedBadge")}</span>}
                </p>
              </div>
              <AdminReviewActions reviewId={r.id} hidden={r.hidden} pinned={r.pinned} reply={r.reply} />
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label={t("pagination")} className="flex items-center justify-between gap-2">
          {page > 0 ? (
            <Link href={href(filter, page - 1)} className="inline-flex min-h-11 items-center rounded-control border border-border bg-surface-2 px-4 text-sm">
              {t("previous")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-text-muted tabular-nums">{t("pageOf", { page: Math.min(page, pages - 1) + 1, pages })}</span>
          {page < pages - 1 ? (
            <Link href={href(filter, page + 1)} className="inline-flex min-h-11 items-center rounded-control border border-border bg-surface-2 px-4 text-sm">
              {t("next")}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}

      <section className="flex flex-col gap-3">
        <h3 className="font-title text-lg font-bold">{t("log")}</h3>
        {logs.length === 0 ? (
          <p className="text-sm text-text-muted">{t("logEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {logs.map((log) => (
              <li key={log.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-control border border-border bg-surface p-3 text-sm">
                <span>
                  {t(`logActions.${logKey(log.action)}`, { admin: log.admin.username, id: log.targetId ?? "" })}
                </span>
                <time dateTime={log.createdAt.toISOString()} className="text-xs text-text-muted">
                  {format.dateTime(log.createdAt, { dateStyle: "short", timeStyle: "short" })}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
