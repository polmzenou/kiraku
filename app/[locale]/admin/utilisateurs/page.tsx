import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { DirectSendPanel } from "@/components/admin/DirectSendPanel";
import { ResponsiveTable } from "@/components/admin/ResponsiveTable";
import { UserSelectCheckbox, UserSelection } from "@/components/admin/UserDeletion";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Link } from "@/i18n/navigation";
import { adminUsersQuery, parseUserListParams, sortToggle, USER_FILTERS, USER_SORTS, type UserSort } from "@/lib/admin/users";
import { localize, parseLocalized } from "@/lib/boosters/types";
import { requireAdmin } from "@/server/admin";
import { prisma } from "@/server/db";
import { countBroadcastAudience } from "@/server/economy/lot-grant-core";
import { listAdminUsers } from "@/server/admin/users";
import { inputClass, selectClass } from "@/components/ui/Field";

export default async function AdminUsersPage({ searchParams }: PageProps<"/[locale]/admin/utilisateurs">) {
  const admin = await requireAdmin();
  const params = parseUserListParams(await searchParams);
  const [t, format, locale, result, boosterTypes, registered] = await Promise.all([
    getTranslations("admin.users"),
    getFormatter(),
    getLocale(),
    listAdminUsers(params),
    prisma.boosterType.findMany({ orderBy: [{ family: "asc" }, { sortOrder: "asc" }], select: { id: true, name: true } }),
    countBroadcastAudience(prisma, "REGISTERED"),
  ]);
  const href = (page: number) => ({ pathname: "/admin/utilisateurs", query: adminUsersQuery(params, { page }) });
  // En-tête cliquable : trie par cette colonne, ou inverse le sens si elle l'est déjà
  const column = (key: UserSort, label: string) => {
    const next = sortToggle(params, key);
    return {
      label,
      sort: {
        href: { pathname: "/admin/utilisateurs", query: adminUsersQuery(params, next) },
        active: params.sort === key ? params.dir : undefined,
        label: t(next.dir === "asc" ? "sortAsc" : "sortDesc", { column: label }),
      },
    };
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
        <p className="mt-1 max-w-prose text-sm text-text-muted">{t("intro")}</p>
      </div>
      <DirectSendPanel boosterTypes={boosterTypes.map((b) => ({ id: b.id, name: localize(parseLocalized(b.name), locale) }))} registered={registered} />
      <form className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto]">
        <label className="flex flex-col gap-1 text-sm">{t("search")}
          <input name="q" defaultValue={params.query} maxLength={100} placeholder={t("searchPlaceholder")} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">{t("filter")}
          <select name="filter" defaultValue={params.filter} className={selectClass}>
            {USER_FILTERS.map((f) => <option key={f} value={f}>{t(`filters.${f}`)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">{t("sortBy")}
          <select name="sort" defaultValue={params.sort} className={selectClass}>
            {USER_SORTS.map((s) => <option key={s} value={s}>{t(`sorts.${s}`)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">{t("sortDir")}
          <select name="dir" defaultValue={params.dir} className={selectClass}>
            <option value="asc">{t("dirAsc")}</option>
            <option value="desc">{t("dirDesc")}</option>
          </select>
        </label>
        <Button type="submit">{t("searchButton")}</Button>
      </form>
      <p className="text-sm text-text-muted">{t("total", { count: result.total })}</p>
      {result.users.length === 0 ? <p>{t("empty")}</p> : (
        <UserSelection selectable={result.users.filter((u) => u.role !== "ADMIN" && u.id !== admin.id).map((u) => ({ id: u.id, username: u.username }))}>
        <ResponsiveTable
          caption={t("total", { count: result.total })}
          columns={[
            { key: "player", ...column("name", t("player")), primary: true },
            { key: "status", ...column("status", t("status")), className: "whitespace-nowrap" },
            { key: "coins", ...column("coins", t("coins")), className: "tabular-nums text-kin" },
            { key: "cards", ...column("cards", t("cards")), className: "tabular-nums" },
            { key: "discoveries", ...column("discoveries", t("discoveries")), className: "tabular-nums" },
            { key: "created", ...column("created", t("created")), className: "whitespace-nowrap" },
            { key: "manage", label: t("manage"), actions: true },
          ]}
          rows={result.users.map((u) => ({
            id: u.id,
            cells: {
              player: (
                <span className="flex items-start gap-3">
                  <UserSelectCheckbox id={u.id} username={u.username} disabled={u.role === "ADMIN" || u.id === admin.id} />
                  <span className="min-w-0">
                    <Link href={`/admin/utilisateurs/${u.id}`} className="font-bold text-link underline underline-offset-4">{u.username}</Link>
                    <p className="text-xs break-all text-text-muted">{u.email ?? t("noEmail")}</p>
                  </span>
                </span>
              ),
              status: (
                <span className="flex flex-col">
                  {t(u.bannedAt ? "banned" : u.role === "ADMIN" ? "adminRole" : u.isGuest ? "guest" : "registered")}
                  {u.ambassadorSince && <span className="text-xs font-bold text-hisui">{t("ambassadorRole")}</span>}
                  {u.anonymizedAt ? (
                    <span className="text-xs text-text-muted">{t("anonymized")}</span>
                  ) : u.deletionRequestedAt ? (
                    <span className="text-xs text-shu">{t("deletionPending")}</span>
                  ) : null}
                </span>
              ),
              coins: format.number(u.coins),
              cards: format.number(u._count.cards),
              discoveries: format.number(u._count.discoveries),
              created: format.dateTime(u.createdAt, { dateStyle: "short" }),
              manage: (
                <Link href={`/admin/utilisateurs/${u.id}`} className={buttonClasses()}>
                  {t("manage")}<span className="sr-only"> {u.username}</span>
                </Link>
              ),
            },
          }))}
        />
        </UserSelection>
      )}
      <nav aria-label={t("pagination")} className="flex flex-wrap items-center justify-between gap-3">
        {result.page > 0 ? <Link href={href(result.page - 1)} className={buttonClasses()}>{t("previous")}</Link> : <span />}
        <span className="text-sm">{t("page", { page: result.page + 1, pages: result.pages })}</span>
        {result.page + 1 < result.pages && <Link href={href(result.page + 1)} className={buttonClasses()}>{t("next")}</Link>}
      </nav>
    </div>
  );
}
