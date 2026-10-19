"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { ledgerHref, type LedgerFilter } from "@/lib/economy/ledger-view";
import { loadLedgerPageAction } from "@/server/actions/economy";
import type { LedgerRow } from "@/server/economy/queries";
import { Button } from "../ui/Button";

/** Historique des Zeni : une ligne par mouvement, pages suivantes chargées à la demande. */
export function LedgerList({
  filter,
  initial,
  initialCursor,
  serverNow,
}: {
  filter: LedgerFilter;
  initial: LedgerRow[];
  initialCursor: string | null;
  serverNow: string;
}) {
  const t = useTranslations("economy.ledger");
  const format = useFormatter();
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const now = new Date(serverNow);

  const more = () =>
    startTransition(async () => {
      setError(false);
      try {
        const res = await loadLedgerPageAction({ filter, cursor });
        if (!res.ok) {
          setError(true);
          return;
        }
        setItems((list) => {
          const seen = new Set(list.map((r) => r.id));
          return [...list, ...res.items.filter((r) => !seen.has(r.id))];
        });
        setCursor(res.nextCursor);
      } catch {
        setError(true);
      }
    });

  if (items.length === 0) {
    return <p className="lacquer rounded-card p-6 text-center text-text-muted">{t("empty")}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-border lacquer rounded-card">
        {items.map((row) => {
          const href = ledgerHref(row.reason, row.refId);
          const label = t(`reasons.${row.reason}`);
          const createdAt = new Date(row.createdAt);
          return (
            <li key={row.id} className="flex min-h-14 items-center justify-between gap-3 px-4 py-2">
              <div className="flex min-w-0 flex-col">
                {href ? (
                  <Link href={href} className="truncate font-bold text-link underline-offset-4 hover:underline">
                    {label}
                  </Link>
                ) : (
                  <span className="truncate font-bold">{label}</span>
                )}
                <time dateTime={createdAt.toISOString()} className="text-xs text-text-muted" title={format.dateTime(createdAt, { dateStyle: "medium", timeStyle: "short" })}>
                  {format.relativeTime(createdAt, now)}
                </time>
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <span className={`font-bold tabular-nums ${row.amount > 0 ? "text-kin" : "text-text"}`}>
                  {row.amount > 0 ? t("amountIn", { amount: row.amount }) : t("amountOut", { amount: -row.amount })}
                </span>
                {row.balanceAfter !== null && (
                  <span className="text-xs tabular-nums text-text-muted">{t("balanceAfter", { amount: row.balanceAfter })}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {error && (
        <p className="text-sm text-shu" role="alert">
          {t("error")}
        </p>
      )}
      {cursor && (
        <Button type="button" onClick={more} disabled={pending} className="self-center">
          {pending ? t("loading") : t("more")}
        </Button>
      )}
    </div>
  );
}
