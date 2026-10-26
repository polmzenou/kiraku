"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { CloseIcon, IconButton } from "./IconButton";

/**
 * Feuille qui monte du bas (sur desktop : panneau centré), sur un <dialog> natif : focus piégé,
 * Échap et clic sur le fond la referment. Contrôlée par `open` ; `onClose` est appelé dans tous les cas.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  const t = useTranslations("common");
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close();
      }}
      className={`fixed inset-x-0 top-auto bottom-0 m-0 max-h-[88dvh] w-full max-w-none translate-y-full overflow-y-auto overscroll-contain rounded-t-[24px] border-t border-border bg-bg p-0 shadow-float text-text opacity-0 transition-[translate,opacity,display,overlay] transition-discrete duration-300 ease-out backdrop:bg-black/60 open:translate-y-0 open:opacity-100 starting:open:translate-y-full starting:open:opacity-0 motion-reduce:transition-none md:inset-0 md:m-auto md:h-fit md:max-h-[85dvh] md:translate-y-4 md:rounded-hero md:border md:open:translate-y-0 md:starting:open:translate-y-4 ${
        wide ? "md:w-[min(56rem,calc(100vw-4rem))]" : "md:w-[min(32rem,calc(100vw-4rem))]"
      }`}
    >
      <div className="flex flex-col gap-4 px-4 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:px-6 md:pt-4 md:pb-6">
        <span aria-hidden="true" className="h-1.5 w-10 self-center rounded-full bg-text-muted/30 md:hidden" />
        <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-2 bg-bg px-4 py-1 md:-mx-6 md:px-6">
          <h2 id={titleId} className="min-w-0 truncate font-heading text-lg font-extrabold">
            {title}
          </h2>
          <IconButton aria-label={t("close")} onClick={() => dialog.current?.close()} tone="lacquer">
            <CloseIcon />
          </IconButton>
        </div>
        {children}
      </div>
    </dialog>
  );
}
