"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { AdminEntryRow } from "@/server/event/showcase-queries";
import { removeShowcaseEntryAction } from "@/server/actions/showcase-event";

/** Inscriptions de l'édition en cours, votes en direct (admin seulement), avec retrait de modération. */
export function ShowcaseEventEntries({ rows }: { rows: readonly AdminEntryRow[] }) {
  const t = useTranslations("admin.showcaseEvent");
  const format = useFormatter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove(row: AdminEntryRow) {
    if (!window.confirm(t("removeConfirm", { name: row.username }))) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await removeShowcaseEntryAction({ entryId: row.id });
        if (!result.ok) setError(t(`errors.${result.error}`));
      } catch {
        setError(t("errors.UNAVAILABLE"));
      }
    });
  }

  if (rows.length === 0) return <p className="rounded-card border border-dashed border-border p-6 text-center text-text-muted">{t("noEntries")}</p>;
  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-sm font-bold text-shu">
          {error}
        </p>
      )}
      <ul className="grid gap-3 md:grid-cols-2">
        {rows.map((row) => (
          <li key={row.id} className="flex items-start justify-between gap-3 rounded-card border border-border bg-surface p-3">
            <div className="min-w-0">
              <p className="truncate font-bold">{row.username}</p>
              <p className="truncate text-xs text-text-muted">
                {row.name ? `${row.name} · ` : ""}
                {t("cards", { count: row.cards })} · {format.dateTime(new Date(row.createdAt), { dateStyle: "medium", timeStyle: "short" })}
              </p>
              {row.hidden && <p className="mt-1 text-xs font-bold text-shu">{t("hiddenEntry")}</p>}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="text-sm font-bold tabular-nums">{t("votes", { count: row.votes })}</span>
              <button type="button" disabled={pending} onClick={() => remove(row)} className="min-h-11 px-2 text-sm text-shu underline disabled:opacity-50">
                {t("remove")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
