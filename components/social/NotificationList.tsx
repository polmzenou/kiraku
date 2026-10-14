"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { loadNotificationsAction, markNotificationsReadAction } from "@/server/actions/notifications";
import type { NotificationView } from "@/server/social/queries";
import { Button } from "../ui/Button";
import { notificationSeal, useDescribeNotification } from "./describe";

export function NotificationList({ initial, initialCursor }: { initial: NotificationView[]; initialCursor: string | null }) {
  const t = useTranslations("notifications");
  const format = useFormatter();
  const describe = useDescribeNotification();
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const unread = items.filter((n) => !n.read).length;

  const markAll = () =>
    startTransition(async () => {
      const before = items;
      setItems((list) => list.map((n) => ({ ...n, read: true })));
      try {
        const res = await markNotificationsReadAction({ all: true });
        if (!res.ok) {
          setItems(before);
          setError(t(`errors.${res.error}`));
        }
      } catch {
        setItems(before);
        setError(t("errors.unexpected"));
      }
    });

  const open = (n: NotificationView, href: string) => {
    if (!n.read) {
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      void markNotificationsReadAction({ ids: [n.id] }).catch(() => undefined);
    }
    router.push(href);
  };

  const more = () =>
    startTransition(async () => {
      try {
        const res = await loadNotificationsAction({ cursor });
        if (!res.ok) {
          setError(t(`errors.${res.error}`));
          return;
        }
        setItems((list) => {
          const seen = new Set(list.map((n) => n.id));
          return [...list, ...res.items.filter((n) => !seen.has(n.id))];
        });
        setCursor(res.nextCursor);
      } catch {
        setError(t("errors.unexpected"));
      }
    });

  if (items.length === 0) {
    return <p className="rounded-lg border border-border bg-surface p-6 text-center text-text-muted">{t("empty")}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-text-muted" aria-live="polite">
          {t("unreadCount", { count: unread })}
        </p>
        <Button type="button" onClick={markAll} disabled={pending || unread === 0}>
          {t("markAll")}
        </Button>
      </div>

      <ul className="flex flex-col gap-2">
        {items.map((n) => {
          const { text, href } = describe(n);
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => open(n, href)}
                className={`flex min-h-14 w-full items-start gap-3 rounded-lg border p-3 text-left ${
                  n.read ? "border-border bg-surface text-text-muted" : "border-shu/60 bg-surface-2 text-text"
                }`}
              >
                <span aria-hidden="true" lang="ja" className="mt-0.5 font-seal text-lg leading-none text-shu">
                  {notificationSeal(n.type)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={n.read ? "" : "font-bold"}>{text}</span>
                  <time dateTime={new Date(n.createdAt).toISOString()} className="text-xs text-text-muted">
                    {format.relativeTime(new Date(n.createdAt))}
                  </time>
                </span>
                {!n.read && <span className="sr-only">{t("unread")}</span>}
                {!n.read && <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-shu" />}
              </button>
            </li>
          );
        })}
      </ul>

      {error && (
        <p role="alert" className="text-sm text-shu">
          {error}
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
