"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { formatBadge } from "@/lib/social/notifications";
import { pollNotificationsAction } from "@/server/actions/notifications";
import type { NotificationView } from "@/server/social/queries";
import { setUnread } from "../chat/chat-store";
import { useRealtime } from "../realtime/RealtimeProvider";
import { usePoll } from "../realtime/usePoll";
import { badgeClasses } from "../ui/Badge";
import { iconButtonClasses } from "../ui/IconButton";
import { NotificationToasts } from "./NotificationToasts";

/**
 * Cloche de l'en-tête et toasts des nouvelles notifications. Compteur rendu par le serveur, puis
 * sondé (pulse unique avec la pastille du chat) toutes les `pollSeconds`, ou `safetySeconds` quand
 * Ably pousse les nouvelles notifications ; rien tant que l'onglet est caché ou le joueur inactif.
 * Chaque notification arrivée depuis le dernier sondage s'affiche en toast, quel que soit son type.
 */
export function NotificationBell({
  initial,
  serverNow,
  pollSeconds,
  safetySeconds,
}: {
  initial: number;
  /** Heure du serveur au rendu : seules les notifications plus récentes deviennent des toasts. */
  serverNow: string;
  pollSeconds: number;
  /** Délai de secours quand le temps réel est connecté. */
  safetySeconds: number;
}) {
  const t = useTranslations("notifications");
  const [count, setCount] = useState(initial);
  const [rendered, setRendered] = useState(initial);
  const [toasts, setToasts] = useState<NotificationView[]>([]);
  const [more, setMore] = useState(0);
  const since = useRef(serverNow);
  const shown = useRef(new Set<string>());
  const [seconds, setSeconds] = useState({ base: pollSeconds, safety: safetySeconds });
  const { subscribe } = useRealtime();

  // Nouveau rendu serveur (navigation, refresh() après une action) : il fait foi
  if (rendered !== initial) {
    setRendered(initial);
    setCount(initial);
  }

  const poll = useCallback(async () => {
    const res = await pollNotificationsAction({ since: since.current });
    if (!res.ok) return false;
    since.current = res.now;
    setSeconds({ base: res.pollSeconds, safety: res.safetySeconds });
    setCount(res.count);
    if (res.chatUnread !== null) setUnread(res.chatUnread);
    const fresh = res.items.filter((n) => !shown.current.has(n.id));
    if (fresh.length === 0) return false;
    for (const n of fresh) shown.current.add(n.id);
    setToasts((list) => [...fresh, ...list].slice(0, 3));
    setMore((m) => m + res.more);
    return true;
  }, []);

  const pollNow = usePoll(poll, { seconds: seconds.base, realtimeSeconds: seconds.safety, backoff: true });

  // Notification créée pour ce joueur (signal Ably) : sondage immédiat
  useEffect(() => subscribe("user", "notification", () => void pollNow()), [pollNow, subscribe]);

  const badge = formatBadge(count);
  const label = count > 0 ? t("bellUnread", { count }) : t("bell");

  return (
    <>
      <Link prefetch={false}
        href="/notifications"
        aria-label={label}
        title={label}
        className={iconButtonClasses("lacquer")}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9a6 6 0 1 1 12 0c0 5 2 7 2 7H4s2-2 2-7" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
        {badge && (
          <span
            aria-hidden="true"
            className={badgeClasses("shu", "absolute -top-0.5 -right-0.5 ring-2 ring-bg")}
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
