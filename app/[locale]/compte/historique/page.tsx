import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LedgerList } from "@/components/economy/LedgerList";
import { ZeniCoin } from "@/components/layout/ZeniCoin";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { PageShell } from "@/components/PageShell";
import { SectionTitle } from "@/components/SectionTitle";
import { Link } from "@/i18n/navigation";
import { LEDGER_FILTERS, parseLedgerFilter } from "@/lib/economy/ledger-view";
import { ledgerTotals, listLedger } from "@/server/economy/queries";
import { getCurrentUser } from "@/server/user";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Historique des Zeni : chaque mouvement du journal, du plus récent au plus ancien. */
export default async function LedgerPage({ searchParams }: PageProps<"/[locale]/compte/historique">) {
  const [t, user, sp] = await Promise.all([getTranslations("economy.ledger"), getCurrentUser(), searchParams]);
  if (!user) {
    return (
      <PageShell>
        <GuestBootstrap />
      </PageShell>
    );
  }

  const filter = parseLedgerFilter(Array.isArray(sp.filtre) ? sp.filtre[0] : sp.filtre);
  const [page, totals] = await Promise.all([listLedger(user.id, filter, null), ledgerTotals(user.id)]);

  return (
    <PageShell>
      <SectionTitle level={1} kanji="銭" title={t("title")} subtitle={t("intro")} />

      <dl className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-border bg-surface p-3">
          <dt className="text-xs text-text-muted">{t("balance")}</dt>
          <dd className="flex items-center gap-1.5 text-lg font-bold tabular-nums text-kin">
            <ZeniCoin size={14} />
            {t("number", { value: user.coins })}
          </dd>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <dt className="text-xs text-text-muted">{t("earned30")}</dt>
          <dd className="text-lg font-bold tabular-nums">{t("number", { value: totals.earned })}</dd>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <dt className="text-xs text-text-muted">{t("spent30")}</dt>
          <dd className="text-lg font-bold tabular-nums">{t("number", { value: totals.spent })}</dd>
        </div>
      </dl>

      <nav aria-label={t("filters")} className="flex gap-1 overflow-x-auto border-b border-border">
        {LEDGER_FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "all" ? "/compte/historique" : { pathname: "/compte/historique", query: { filtre: f } }}
            aria-current={filter === f ? "page" : undefined}
            className={`flex min-h-11 items-center border-b-[3px] px-3 text-sm font-bold whitespace-nowrap ${
              filter === f ? "border-shu text-text" : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            {t(`filter.${f}`)}
          </Link>
        ))}
      </nav>

      <LedgerList key={filter} filter={filter} initial={page.items} initialCursor={page.nextCursor} serverNow={new Date().toISOString()} />
    </PageShell>
  );
}
