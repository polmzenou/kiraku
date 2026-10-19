"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Bouton « Taux » de la barre du bas (mobile) : ouvre le panneau complet du booster dans une
 * feuille qui monte du bas (<dialog> natif : focus piégé, Échap, clic sur le fond).
 */
export function RatesSheet({ children }: { children: ReactNode }) {
  const t = useTranslations("boosters");
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const pathname = usePathname();
  const search = useSearchParams();

  // Changement de booster : on referme
  useEffect(() => {
    dialog.current?.close();
  }, [pathname, search]);

  const close = () => dialog.current?.close();

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          dialog.current?.showModal();
          setOpen(true);
        }}
        className="min-h-11 shrink-0 rounded-control border border-border bg-surface-2 px-3.5 text-sm font-bold"
      >
        {t("rates")}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === dialog.current) close();
        }}
        className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[88dvh] w-full max-w-none translate-y-full overflow-y-auto overscroll-contain rounded-t-2xl border-t border-border bg-bg p-0 text-text opacity-0 transition-[translate,opacity,display,overlay] transition-discrete duration-300 ease-out backdrop:bg-black/60 open:translate-y-0 open:opacity-100 starting:open:translate-y-full starting:open:opacity-0"
      >
        <div className="flex flex-col gap-3 px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between">
            <h2 id={titleId} className="text-base font-bold">
              {t("ratesTitle")}
            </h2>
            <button
              type="button"
              aria-label={t("close")}
              onClick={close}
              className="inline-flex size-11 items-center justify-center rounded-control text-2xl leading-none"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          {children}
        </div>
      </dialog>
    </>
  );
}
