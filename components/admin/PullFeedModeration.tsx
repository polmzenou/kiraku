"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { PULL_FEED_BLOCK_DURATIONS, type PullFeedBlockDuration } from "@/lib/home/pull-feed-block";
import { blockPullFeedAction, unblockPullFeedAction, type PullFeedBlockResult } from "@/server/actions/admin-pull-feed";
import type { PullFeedBlockRow, PullFeedPreviewRow } from "@/server/admin/pull-feed";
import { Button } from "../ui/Button";
import { Field, FormMessage, inputClass, selectClass } from "./fields";

/**
 * Blacklist du carrousel des gros tirages : ajout par pseudo (ou depuis le fil actuel) pour une durée,
 * liste des joueurs retirés avec leur retour. Le serveur revérifie tout et journalise.
 */
export function PullFeedModeration({ blocked, preview }: { blocked: PullFeedBlockRow[]; preview: PullFeedPreviewRow[] }) {
  const t = useTranslations("admin.pullFeed");
  const tRarity = useTranslations("rarity");
  const format = useFormatter();
  const [username, setUsername] = useState("");
  const [duration, setDuration] = useState<PullFeedBlockDuration>("permanent");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<PullFeedBlockResult>, ok: string) =>
    startTransition(async () => {
      setMessage(null);
      try {
        const res = await action();
        setMessage(res.ok ? { tone: "ok", text: ok } : { tone: "error", text: t(`errors.${res.error}`) });
        if (res.ok) setUsername("");
      } catch {
        setMessage({ tone: "error", text: t("errors.unexpected") });
      }
    });

  const block = (name: string) => run(() => blockPullFeedAction({ username: name, duration }), t("blockedOk", { username: name }));
  const until = (row: PullFeedBlockRow) =>
    row.permanent ? t("permanent") : t("until", { date: format.dateTime(row.until, { dateStyle: "medium", timeStyle: "short" }) });

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="pull-feed-blocklist" className="flex max-w-2xl flex-col gap-4 lacquer rounded-card p-4">
        <h3 id="pull-feed-blocklist" className="font-title text-lg font-bold">
          {t("blocklistTitle")}
        </h3>
        <p className="text-sm text-text-muted">{t("blocklistIntro")}</p>
        <form
          className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (username.trim()) block(username.trim());
          }}
        >
          <Field label={t("username")}>
            {(id) => (
              <input
                id={id}
                value={username}
                maxLength={20}
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setUsername(e.target.value)}
                className={inputClass}
              />
            )}
          </Field>
          <Field label={t("duration")}>
            {(id) => (
              <select id={id} value={duration} onChange={(e) => setDuration(e.target.value as PullFeedBlockDuration)} className={selectClass}>
                {PULL_FEED_BLOCK_DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {t(`durations.${d}`)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Button type="submit" variant="danger" disabled={pending || !username.trim()}>
            {t("block")}
          </Button>
        </form>
        <FormMessage message={message} />

        {blocked.length === 0 ? (
          <p className="text-sm text-text-muted">{t("blocklistEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {blocked.map((row) => (
              <li key={row.userId} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border bg-surface p-3 text-sm">
                <span className="flex min-w-0 flex-col">
                  <Link href={`/admin/utilisateurs/${row.userId}`} className="truncate font-bold underline-offset-2 hover:underline">
                    {row.username}
                  </Link>
                  <span className="text-xs text-text-muted">{until(row)}</span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => unblockPullFeedAction({ userId: row.userId }), t("unblockedOk", { username: row.username }))}
                >
                  {t("unblock")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="pull-feed-preview" className="flex max-w-2xl flex-col gap-3">
        <h3 id="pull-feed-preview" className="font-title text-lg font-bold">
          {t("previewTitle")}
        </h3>
        <p className="text-sm text-text-muted">{t("previewIntro")}</p>
        {preview.length === 0 ? (
          <p className="text-sm text-text-muted">{t("previewEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {preview.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border bg-surface p-3 text-sm">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">
                    <span className="font-bold">{row.username}</span> · {row.cardName}
                  </span>
                  <span className="text-xs text-text-muted">
                    {tRarity(row.rarity)} · {format.dateTime(row.at, { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </span>
                <Button type="button" size="sm" variant="danger" disabled={pending} onClick={() => block(row.username)}>
                  {t("blockPlayer")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
