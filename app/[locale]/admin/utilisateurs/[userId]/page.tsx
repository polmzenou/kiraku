import { DeleteUserButton } from "@/components/admin/UserDeletion";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { DataRequestActions } from "@/components/admin/DataRequestActions";
import { UserEditor } from "@/components/admin/UserEditor";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Link } from "@/i18n/navigation";
import { parseUserListParams, USER_ADMIN_ACTIONS } from "@/lib/admin/users";
import { computeStock, stockRulesFor } from "@/lib/boosters/stock";
import { requireAdmin } from "@/server/admin";
import { adminCardById, getAdminUser, getAdminUserCards } from "@/server/admin/users";
import { readBannerPity } from "@/server/boosters/open-core";
import { getBoosterRules } from "@/server/boosters/rules";
import { inputClass } from "@/components/ui/Field";

export default async function AdminUserPage({ params, searchParams }: PageProps<"/[locale]/admin/utilisateurs/[userId]">) {
  const admin = await requireAdmin();
  const [{ userId }, raw, locale, t, reason, format, rarity] = await Promise.all([params, searchParams, getLocale(), getTranslations("admin.users"), getTranslations("economy.ledger.reasons"), getFormatter(), getTranslations("rarity")]);
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(userId)) notFound();
  const cardParams = parseUserListParams({ q: raw.cardQuery, page: raw.cardPage });
  const [data, collection, selectedCard, rules] = await Promise.all([
    getAdminUser(userId, locale), getAdminUserCards(userId, cardParams.query, cardParams.page),
    typeof raw.card === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(raw.card) ? adminCardById(raw.card) : null,
    getBoosterRules(),
  ]);
  if (!data) notFound();
  const { user, discoveries, catalogTotal, ownedCatalogCards, uniqueCards, boosterTypes, ledger, openings, logs } = data;
  const stock = computeStock(user.boosterStock, user.boosterAnchor, new Date(), stockRulesFor(rules.stock, user.ambassadorSince !== null));
  const pity = readBannerPity(user.bannerPity);
  const cardHref = (page: number, card?: string) => ({ pathname: `/admin/utilisateurs/${userId}`, query: { cardQuery: cardParams.query, cardPage: page, ...(card ? { card } : {}) }, hash: card ? "admin-card-form" : "user-collection" });
  const metrics = [
    { label: "coins", value: format.number(user.coins) },
    { label: "cards", value: format.number(user._count.cards) },
    { label: "uniqueCards", value: format.number(uniqueCards) },
    { label: "discoveries", value: `${format.number(discoveries)} / ${format.number(catalogTotal)}` },
    { label: "boosters", value: format.number(boosterTypes.reduce((sum, b) => sum + b.count, 0)) },
    { label: "openings", value: format.number(user._count.openings) },
  ] as const;
  const actionNames = new Map<string, string>(USER_ADMIN_ACTIONS.map((action) => [action, t(`actions.${action}`)]));

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/utilisateurs" className="self-start text-sm text-link underline underline-offset-4">← {t("back")}</Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="break-all font-heading text-2xl font-bold">{user.username}</h2>
          <p className="mt-1 break-all text-xs text-text-muted">{user.id}</p>
          <p className="mt-2 text-sm">{user.email ?? t("noEmail")}{user.emailVerified ? ` · ${t("verified")}` : ""}</p>
          <p className="mt-1 text-sm text-text-muted">{t(user.bannedAt ? "banned" : user.role === "ADMIN" ? "adminRole" : user.role === "DEV" ? "devRole" : user.isGuest ? "guest" : "registered")}{user.ambassadorSince ? ` · ${t("ambassadorRole")}` : ""} · {t("joined", { date: format.dateTime(user.createdAt, { dateStyle: "medium" }) })}</p>
          {user.discordLinkedAt && <p className="mt-1 text-xs text-text-muted">{t("discordLinked")}</p>}
        </div>
        <Link href={`/u/${user.username}`} className={buttonClasses()}>{t("viewProfile")}</Link>
      </header>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {metrics.map((m) => <div key={m.label} className="lacquer rounded-card p-4"><dt className="text-xs text-text-muted">{t(m.label)}</dt><dd className="mt-1 text-xl font-bold tabular-nums">{m.value}</dd></div>)}
      </dl>
      <UserEditor userId={userId} account={{ username: user.username, role: user.role, banned: !!user.bannedAt, profileVisibility: user.profileVisibility, showCollection: user.showCollection }} ambassadorSince={user.ambassadorSince} leaderboardHiddenAt={user.leaderboardHiddenAt} self={admin.id === userId}
        coins={user.coins} stats={{ boosterStock: stock.stock, rankPoints: user.rankPoints, pityCount: user.pityCount, standardCount: user.standardCount }}
        boosters={boosterTypes.map((b) => ({ ...b, pity: pity[b.id] ?? 0 }))} discoveries={discoveries} catalogTotal={catalogTotal} ownedCatalogCards={ownedCatalogCards} selectedCard={selectedCard} sessions={user._count.sessions} />

      <section className="flex flex-col gap-3 lacquer rounded-card p-4">
        <h3 className="font-title text-xl font-bold">{t("gdprTitle")}</h3>
        <p className="text-sm text-text-muted">
          {user.anonymizedAt
            ? t("gdprAnonymized", { date: format.dateTime(user.anonymizedAt, { dateStyle: "medium" }) })
            : user.deletionRequestedAt
              ? t("gdprPending", { date: format.dateTime(user.deletionRequestedAt, { dateStyle: "medium" }) })
              : t("gdprNone")}
          {" · "}
          {user.termsVersion ? t("termsAccepted", { version: user.termsVersion }) : t("termsNotAccepted")}
        </p>
        {!user.anonymizedAt && admin.id !== userId && (
          <DataRequestActions userId={userId} username={user.username} showCancel={user.deletionRequestedAt !== null} />
        )}
        {admin.id !== userId && user.role !== "ADMIN" && (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <p className="text-sm text-text-muted">{t("deletion.hint")}</p>
            <div>
              <DeleteUserButton id={userId} username={user.username} />
            </div>
          </div>
        )}
      </section>

      <section id="user-collection" className="flex scroll-mt-8 flex-col gap-3">
        <h3 className="font-title text-xl font-bold">{t("collection")}</h3>
        <form className="flex gap-2">
          <label htmlFor="user-collection-search" className="sr-only">{t("filterCollection")}</label>
          <input id="user-collection-search" name="cardQuery" defaultValue={cardParams.query} maxLength={100} className={inputClass} placeholder={t("filterCollection")} />
          <Button type="submit">{t("searchButton")}</Button>
        </form>
        {collection.cards.length === 0 ? <p className="text-sm text-text-muted">{t("collectionEmpty")}</p> : <div className="overflow-x-auto lacquer rounded-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-surface-2"><tr>{(["card", "rarity", "copies", "discovered", "manage"] as const).map((k) => <th key={k} scope="col" className="p-3">{t(k)}</th>)}</tr></thead>
            <tbody>{collection.cards.map((c) => <tr key={c.id} className="border-b border-border last:border-0">
              <td className="p-3"><Link href={`/wiki/${c.anilistId}`} className="font-bold text-link underline underline-offset-4">{c.name}</Link>{c.rank === null && <p className="text-xs text-text-muted">{t("archivedCard")}</p>}</td>
              <td className="p-3">{rarity(c.rarity)}</td><td className="p-3 tabular-nums">{c._count.copies}</td><td className="p-3">{t(c.discoveries.length > 0 || c._count.copies > 0 ? "yes" : "no")}</td>
              <td className="p-3"><Link href={cardHref(collection.page, c.id)} className={buttonClasses()}>{t("manage")}<span className="sr-only"> {c.name}</span></Link></td>
            </tr>)}</tbody>
          </table>
        </div>}
        <nav aria-label={t("collectionPagination")} className="flex flex-wrap items-center justify-between gap-3">
          {collection.page > 0 ? <Link href={cardHref(collection.page - 1)} className={buttonClasses()}>{t("previous")}</Link> : <span />}
          <span className="text-sm">{t("page", { page: collection.page + 1, pages: collection.pages })}</span>
          {collection.page + 1 < collection.pages && <Link href={cardHref(collection.page + 1)} className={buttonClasses()}>{t("next")}</Link>}
        </nav>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h3 className="font-title text-xl font-bold">{t("ledger")}</h3>
          {ledger.length === 0 ? <p className="text-sm text-text-muted">{t("historyEmpty")}</p> : <ul className="divide-y divide-border lacquer rounded-card">
            {ledger.map((entry) => <li key={entry.id} className="flex items-center justify-between gap-3 p-3 text-sm"><div><p>{reason(entry.reason)}</p><time className="text-xs text-text-muted">{format.dateTime(entry.createdAt, { dateStyle: "short", timeStyle: "short" })}</time></div><div className="text-right tabular-nums"><p className={entry.amount >= 0 ? "font-bold text-kin" : "font-bold text-shu"}>{entry.amount > 0 ? "+" : ""}{format.number(entry.amount)}</p>{entry.balanceAfter !== null && <p className="text-xs text-text-muted">{t("balance")} {format.number(entry.balanceAfter)}</p>}</div></li>)}
          </ul>}
        </section>
        <section className="flex flex-col gap-3">
          <h3 className="font-title text-xl font-bold">{t("recentOpenings")}</h3>
          {openings.length === 0 ? <p className="text-sm text-text-muted">{t("historyEmpty")}</p> : <ul className="divide-y divide-border lacquer rounded-card">
            {openings.map((opening) => <li key={opening.id} className="flex items-center justify-between gap-3 p-3 text-sm"><div><p>{boosterTypes.find((b) => b.slug === opening.boosterSlug)?.name ?? opening.boosterSlug}{opening.divine ? ` · ${t("divine")}` : opening.golden ? ` · ${t("golden")}` : ""}</p><time className="text-xs text-text-muted">{format.dateTime(opening.createdAt, { dateStyle: "short", timeStyle: "short" })}</time></div><Link href={`/tirage/${opening.id}`} className="inline-flex min-h-11 items-center text-link underline underline-offset-4">{t("view")}</Link></li>)}
          </ul>}
        </section>
      </div>
      <section className="flex flex-col gap-3">
        <h3 className="font-title text-xl font-bold">{t("audit")}</h3>
        {logs.length === 0 ? <p className="text-sm text-text-muted">{t("historyEmpty")}</p> : <ul className="flex flex-col gap-2">
          {logs.map((log) => <li key={log.id}><details className="lacquer rounded-card p-3 text-sm"><summary className="cursor-pointer"><strong>{actionNames.get(log.action) ?? log.action}</strong> · {log.admin.username} · {format.dateTime(log.createdAt, { dateStyle: "short", timeStyle: "short" })}</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><div><h4 className="mb-1 font-bold">{t("before")}</h4><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs text-text-muted">{JSON.stringify(log.before, null, 2)}</pre></div><div><h4 className="mb-1 font-bold">{t("after")}</h4><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs text-text-muted">{JSON.stringify(log.after, null, 2)}</pre></div></div></details></li>)}
        </ul>}
      </section>
    </div>
  );
}
