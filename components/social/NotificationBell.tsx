"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { formatBadge } from "@/lib/social/notifications";
import { pollNotificationsAction } from "@/server/actions/notifications";
import type { NotificationView } from "@/server/social/queries";
import { NotificationToasts } from "./NotificationToasts";

/**
 * Cloche de l'en-tête et toasts des nouvelles notifications. Compteur rendu par le serveur, puis
 * sondé toutes les `pollSeconds` tant que l'onglet est visible (aucun sondage en arrière-plan).
 * Chaque notification arrivée depuis le dernier sondage s'affiche en toast, quel que soit son type.
 */
export function NotificationBell({
  initial,
  serverNow,
  pollSeconds,
}: {
  initial: number;
  /** Heure du serveur au rendu : seules les notifications plus récentes deviennent des toasts. */
  serverNow: string;
  pollSeconds: number;
}) {
  const t = useTranslations("notifications");
  const [count, setCount] = useState(initial);
  const [rendered, setRendered] = useState(initial);
  const [toasts, setToasts] = useState<NotificationView[]>([]);
  const [more, setMore] = useState(0);
  const since = useRef(serverNow);
  const shown = useRef(new Set<string>());
  const interval = useRef(pollSeconds);

  // Nouveau rendu serveur (navigation, refresh() après une action) : il fait foi
  if (rendered !== initial) {
    setRendered(initial);
    setCount(initial);
  }

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const poll = async () => {
      try {
        const res = await pollNotificationsAction({ since: since.current });
        if (!res.ok || stopped) return;
        since.current = res.now;
        interval.current = res.pollSeconds;
        setCount(res.count);
        const fresh = res.items.filter((n) => !shown.current.has(n.id));
        if (fresh.length > 0) {
          for (const n of fresh) shown.current.add(n.id);
          setToasts((list) => [...fresh, ...list].slice(0, 3));
          setMore((m) => m + res.more);
        }
      } catch {
        // Réseau coupé : on réessaiera au prochain tour
      }
    };

    const schedule = () => {
      clearTimeout(timer);
      if (stopped || document.visibilityState !== "visible") return;
      timer = setTimeout(async () => {
        await poll();
        schedule();
      }, interval.current * 1000);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        // Retour sur l'onglet : on rattrape tout de suite ce qui est arrivé entre-temps
        void poll().then(schedule);
      } else {
        clearTimeout(timer);
      }
    };

    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const badge = formatBadge(count);
  const label = count > 0 ? t("bellUnread", { count }) : t("bell");

  return (
    <>
      <Link
        href="/notifications"
        aria-label={label}
        title={label}
        className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-button text-text-muted hover:text-text"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9a6 6 0 1 1 12 0c0 5 2 7 2 7H4s2-2 2-7" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
        {badge && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-0.5 min-w-[18px] rounded-full bg-shu-btn px-1 text-center text-[11px] leading-[18px] font-bold text-washi-paper tabular-nums"
          >
            {badge}
          </span>
        )}
      </Link>
      <NotificationToasts
        toasts={toasts}
        more={more}
        onDismiss={(id) => setToasts((list) => list.filter((n) => n.id !== id))}
        onDismissMore={() => setMore(0)}
        onRead={() => setCount((c) => Math.max(0, c - 1))}
      />
    </>
  );
}
