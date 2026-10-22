import { getLocale, getTranslations } from "next-intl/server";
import { AdminCancelAuctionButton } from "@/components/admin/AdminCancelAuctionButton";
import { AdminNoteDelete } from "@/components/market/AdminNoteDelete";
import { MarketSettingsForm } from "@/components/admin/MarketSettingsForm";
import { Link } from "@/i18n/navigation";
import { MARKET_SETTING_KEYS, type MarketSettings } from "@/lib/settings/market-form";
import { recentSettingLogs, requireAdmin } from "@/server/admin";
import { adminActiveAuctions, adminRecentNotes, marketTotals } from "@/server/market/queries";
import { getSetting } from "@/server/settings";

/** Marché : santé (ventes ouvertes, séquestre, taxes), annulation forcée et réglages. */
export default async function AdminMarketPage() {
  await requireAdmin();
  const locale = await getLocale();
  const now = new Date();
  const [t, values, totals, auctions, notes, logs] = await Promise.all([
    getTranslations("admin.market"),
    Promise.all(MARKET_SETTING_KEYS.map((k) => getSetting(k))),
    marketTotals(now),
    adminActiveAuctions(locale),
    adminRecentNotes(locale),
    recentSettingLogs(["market."]),
  ]);
  const settings = Object.fromEntries(MARKET_SETTING_KEYS.map((k, i) => [k, values[i]])) as MarketSettings;

  const stats = [
    { label: t("active"), value: t("count", { count: totals.active }) },
    { label: t("escrow"), value: t("zeni", { amount: totals.escrow }) },
    { label: t("sold24h"), value: t("count", { count: totals.sold24h }) },
    { label: t("fees24h"), value: t("zeni", { amount: totals.fees24h }) },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="font-title text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="lacquer rounded-card p-4">
            <dt className="text-sm text-text-muted">{s.label}</dt>
            <dd className="text-xl font-bold tabular-nums text-kin">{s.value}</dd>
          </div>
        ))}
      </dl>

      <section className="flex flex-col gap-3">
        <h3 className="font-title text-lg font-bold">{t("listTitle")}</h3>
        {auctions.length === 0 ? (
          <p className="text-sm text-text-muted">{t("listEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {auctions.map((a) => (
              <li
                key={a.id}
                className="flex flex-col gap-2 rounded-control border border-border bg-surface p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <Link href={`/marche/${a.id}`} className="font-bold text-link underline underline-offset-4">
                    {t("row", { card: a.cardName, price: a.price, bids: a.bidCount })}
                  </Link>
                  <span className="text-xs text-text-muted">
                    {t("seller", { name: a.sellerName })}
                    {a.leaderName ? ` · ${t("leader", { name: a.leaderName })}` : ""} · {t("endsAt", { date: a.endsAt })}
                  </span>
                </div>
                <AdminCancelAuctionButton auctionId={a.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="font-title text-lg font-bold">{t("notes.title")}</h3>
        <p className="max-w-prose text-sm text-text-muted">{t("notes.intro")}</p>
        {notes.length === 0 ? (
          <p className="text-sm text-text-muted">{t("notes.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {notes.map((n) => (
              <li key={`${n.kind}-${n.id}`} className="flex items-start gap-3 rounded-control border border-border bg-surface p-3 text-sm">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Link
                    href={n.kind === "AUCTION" ? `/marche/${n.id}` : "/marche?onglet=echanges"}
                    className="w-fit font-bold text-link underline underline-offset-4"
                  >
                    {t(n.kind === "AUCTION" ? "notes.auction" : "notes.listing", { card: n.cardName, name: n.author })}
                  </Link>
                  <p className="whitespace-pre-line break-words">{n.note}</p>
                </div>
                <AdminNoteDelete kind={n.kind} id={n.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <MarketSettingsForm initial={settings} />

      <section className="flex flex-col gap-3">
        <h3 className="font-title text-lg font-bold">{t("log")}</h3>
        {logs.length === 0 ? (
          <p className="text-sm text-text-muted">{t("logEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {logs.map((log) => (
              <li key={log.id} className="flex flex-col gap-1 rounded-control border border-border bg-surface p-3 text-sm">
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
