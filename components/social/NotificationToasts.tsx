"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "@/i18n/navigation";
import { markNotificationsReadAction } from "@/server/actions/notifications";
import type { NotificationView } from "@/server/social/queries";
import { notificationSeal, useDescribeNotification } from "./describe";

const VISIBLE_MS = 7000;

/**
 * Pile de toasts sous l'en-tête (en haut à droite sur desktop). Chaque toast se ferme seul après
 * quelques secondes, sauf tant que le doigt, la souris ou le focus est dessus ; un appui ouvre la
 * notification et la marque comme lue. Entrée en transform/opacity, coupée si reduced-motion.
 */
export function NotificationToasts({
  toasts,
  more,
  onDismiss,
  onDismissMore,
  onRead,
}: {
  toasts: NotificationView[];
  more: number;
  onDismiss: (id: string) => void;
  onDismissMore: () => void;
  onRead: () => void;
}) {
  const t = useTranslations("notifications");
  const describe = useDescribeNotification();
  const router = useRouter();

  // Le contenu de la page dépend peut-être de ce qui vient d'arriver (demandes, boosters offerts)
  const latest = toasts[0]?.id;
  useEffect(() => {
    if (latest) router.refresh();
  }, [latest, router]);

  if (toasts.length === 0 && more === 0) return null;

  // Portail sur <body> : le flou de l'en-tête (backdrop-filter) piégerait sinon le `fixed`
  return createPortal(
    <section
      aria-label={t("toastsLabel")}
      className="fixed inset-x-4 top-[calc(4rem+env(safe-area-inset-top))] z-50 flex flex-col gap-2 md:top-[calc(4.5rem+env(safe-area-inset-top))] md:right-6 md:left-auto md:w-96"
    >
      {toasts.map((n) => {
        const { text, href } = describe(n);
        return (
          <Toast
            key={n.id}
            seal={notificationSeal(n.type)}
            text={text}
            onOpen={() => {
              onDismiss(n.id);
              onRead();
              void markNotificationsReadAction({ ids: [n.id] }).catch(() => undefined);
              router.push(href);
            }}
            onClose={() => onDismiss(n.id)}
          />
        );
      })}
      {more > 0 && (
        <Toast
          seal="報"
          text={t("toastMore", { count: more })}
          onOpen={() => {
            onDismissMore();
            router.push("/notifications");
          }}
          onClose={onDismissMore}
        />
      )}
    </section>,
    document.body,
  );
}

function Toast({ seal, text, onOpen, onClose }: { seal: string; text: string; onOpen: () => void; onClose: () => void }) {
  const t = useTranslations("notifications");
  const tCommon = useTranslations("common");
  const [paused, setPaused] = useState(false);
  const close = useRef(onClose);

  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => close.current(), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [paused]);

  return (
    <div
      role="status"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="flex items-stretch overflow-hidden rounded-lg border border-shu/60 bg-surface-2 text-text shadow-[0_8px_24px_rgb(0_0_0/0.35)] transition-[translate,opacity] duration-300 ease-out starting:-translate-y-3 starting:opacity-0 motion-reduce:transition-none"
    >
      <button type="button" onClick={onOpen} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left">
        <span aria-hidden="true" lang="ja" className="font-seal text-xl leading-none text-shu">
          {seal}
        </span>
        <span className="min-w-0 flex-1 text-sm">
          {text}
          <span className="sr-only"> {t("toastOpen")}</span>
        </span>
      </button>
      <button
        type="button"
        aria-label={tCommon("close")}
        onClick={onClose}
        className="inline-flex w-11 shrink-0 items-center justify-center text-xl leading-none text-text-muted hover:text-text"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
