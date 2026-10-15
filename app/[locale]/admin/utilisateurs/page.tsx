import { getFormatter, getTranslations } from "next-intl/server";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Link } from "@/i18n/navigation";
import { parseUserListParams, USER_FILTERS } from "@/lib/admin/users";
import { requireAdmin } from "@/server/admin";
import { listAdminUsers } from "@/server/admin/users";

const inputClass = "min-h-11 w-full min-w-0 rounded-button border border-border bg-surface-2 px-3 text-base";

export default async function AdminUsersPage({ searchParams }: PageProps<"/[locale]/admin/utilisateurs">) {
  await requireAdmin();
  const params = parseUserListParams(await searchParams);
  const [t, format, result] = await Promise.all([getTranslations("admin.users"), getFormatter(), listAdminUsers(params.query, params.filter, params.page)]);
  const href = (page: number) => ({ pathname: "/admin/utilisateurs", query: { q: params.query, filter: params.filter, page } });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-title text-2xl font-bold">{t("title")}</h2>
        <p className="mt-1 max-w-prose text-sm text-text-muted">{t("intro")}</p>
      </div>
      <form className="grid items-end gap-3 sm:grid-cols-[1fr_auto_auto]">
        <label className="flex flex-col gap-1 text-sm">{t("search")}
          <input name="q" defaultValue={params.query} maxLength={100} placeholder={t("searchPlaceholder")} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">{t("filter")}
          <select name="filter" defaultValue={params.filter} className={inputClass}>
            {USER_FILTERS.map((f) => <option key={f} value={f}>{t(`filters.${f}`)}</option>)}
          </select>
        </label>
        <Button type="submit">{t("searchButton")}</Button>
      </form>
      <p className="text-sm text-text-muted">{t("total", { count: result.total })}</p>
      {result.users.length === 0 ? <p>{t("empty")}</p> : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-surface-2"><tr>
              {(["player", "status", "coins", "cards", "discoveries", "created", "manage"] as const).map((key) => <th key={key} scope="col" className="whitespace-nowrap p-3">{t(key)}</th>)}
            </tr></thead>
            <tbody>{result.users.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0">
                <td className="p-3"><Link href={`/admin/utilisateurs/${u.id}`} className="font-bold text-link underline underline-offset-4">{u.username}</Link><p className="text-xs text-text-muted">{u.email ?? t("noEmail")}</p></td>
                <td className="whitespace-nowrap p-3">{t(u.bannedAt ? "banned" : u.role === "ADMIN" ? "adminRole" : u.isGuest ? "guest" : "registered")}</td>
                <td className="p-3 tabular-nums text-kin">{format.number(u.coins)}</td>
                <td className="p-3 tabular-nums">{format.number(u._count.cards)}</td>
                <td className="p-3 tabular-nums">{format.number(u._count.discoveries)}</td>
                <td className="whitespace-nowrap p-3">{format.dateTime(u.createdAt, { dateStyle: "short" })}</td>
                <td className="p-3"><Link href={`/admin/utilisateurs/${u.id}`} className={buttonClasses()}>{t("manage")}<span className="sr-only"> {u.username}</span></Link></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <nav aria-label={t("pagination")} className="flex flex-wrap items-center justify-between gap-3">
        {result.page > 0 ? <Link href={href(result.page - 1)} className={buttonClasses()}>{t("previous")}</Link> : <span />}
        <span className="text-sm">{t("page", { page: result.page + 1, pages: result.pages })}</span>
        {result.page + 1 < result.pages && <Link href={href(result.page + 1)} className={buttonClasses()}>{t("next")}</Link>}
      </nav>
    </div>
  );
}
